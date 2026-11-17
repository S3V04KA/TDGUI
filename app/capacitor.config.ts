import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.touchgui.app",
  appName: "TouchGUI",
  webDir: "dist",
  backgroundColor: "#141218",
  android: {
    allowMixedContent: true, // TD-сервер по http/ws в локальной сети
  },
  server: {
    androidScheme: "http",
  },
};

export default config;
