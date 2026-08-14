// public/js/app-state.mjs
import { createStore } from "./core/state.mjs";

export const appStore = createStore({
  route: null,
  theme: {
    preference: "system",
    resolved: "dark",
    announce: false,
  },
  ui: {
    menuOpen: false,
    wheelFilmId: null,
    notice: null,
  },
  publicCatalog: {
    status: "idle",
    data: null,
    errorCode: null,
  },
  session: {
    status: "unknown",
    data: null,
    errorCode: null,
    csvPreview: null,
  },
});
