import devtools from "@vue/devtools";
import { isAndroid } from "@nativescript/core";
import * as toasty from "@triniwiz/nativescript-toasty";
import * as nsSocketIo from "@triniwiz/nativescript-socketio";
import type { VueConstructor } from "vue";

if (!global.performance) {
    (global.performance as any) = {};
}

if (!global.performance.now) {
    const nowOffset = Date.now();

    global.performance.now = function now() {
        return Date.now() - nowOffset;
    };
}

if (!global.requestAnimationFrame) {
    global.requestAnimationFrame = function raf(cb) {
        return setTimeout(cb, 1000 / 60);
    };
}

// fixes a crash when running VueDevtools
if (!global.HTMLElement) {
    (global.HTMLElement as any) = function () {
        return false;
    };
}

/**
 * Returns the correct address for the host machine when running on emulator
 */
const getServerIpAddress = (host: string | null, port: number): string => {
    if (host) {
        return `${host}:${port}`;
    }

    if (isAndroid) {
        // @ts-ignore
        const FINGERPRINT = android.os.Build.FINGERPRINT;
        if (FINGERPRINT.includes("vbox")) {
            // running on genymotion
            return `10.0.3.2:${port}`;
        } else if (FINGERPRINT.includes("generic")) {
            // running on android emulator
            return `10.0.2.2:${port}`;
        }
    }

    // ios simulator uses localhost
    return `127.0.0.1:${port}`;
};

// Wrap the toast message in a try, devtool still work without toaster
const showToast = (message: string): void => {
    try {
        const { Toasty } = toasty;
        new Toasty({
            text: message,
            backgroundColor: "#53ba82",
            yAxisOffset: 50,
        }).show();
    } catch (error) {
        console.log(error);
    }
};

const install = (
    Vue: VueConstructor,
    { debug = false, host = null, port = 8098 } = {}
): void => {
    // ensure all dependencies are available and bail out if anything is missing
    try {
        require.resolve("@vue/devtools");
    } catch (e) {
        console.log(
            "[nativescript-vue-devtools] skipping install due to missing dependencies.\n\n",
            e,
            "\n\n"
        );
        return;
    }

    const startApp = Vue.prototype.$start;

    Vue.prototype.$start = function () {
        const setupDevtools = () => {
            const options = {
                app: this,
                showToast,
                io() {
                    try {
                        const { SocketIO } = nsSocketIo;
                        const address = `http://${getServerIpAddress(
                            host,
                            port
                        )}`;
                        // this line causes a crash. the socketio plugin needs to be updated to nativescript version 8.0
                        let socketIO = new SocketIO(address, { debug: debug });
                        socketIO.connect();
                        return socketIO;
                    } catch (error) {
                        console.log(error);
                        // prevent crashing by returning a noop stub
                        return {
                            on() {},
                            emit() {},
                        };
                    }
                },
            };

            // vue-dev-tools type files are outdated so this is to get around that
            (devtools as any).connect("ws://localhost", port, options);
            (devtools as any).init(Vue);
        };

        if (isAndroid) {
            setupDevtools();
        } else {
            // on ios we need to delay the call because the socket connection is not established
            // if called too early in the application startup process
            // we might need to add a delay to the setTimeout in the future
            setTimeout(setupDevtools);
        }

        return startApp.call(this);
    };
};

export default {
    install,
};
