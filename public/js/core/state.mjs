// public/js/core/state.mjs
/**
 * Tiny immutable store with synchronous Pub/Sub notifications.
 * Modules publish state transitions through setState; UI modules subscribe
 * without relying on writable globals.
 */
export function createStore(initialState) {
  let state = deepFreeze(initialState);
  const subscribers = new Set();

  function getState() {
    return state;
  }

  function setState(updater, action = "state/update") {
    const nextState =
      typeof updater === "function" ? updater(state) : updater;

    if (!nextState || typeof nextState !== "object") {
      throw new TypeError("Store updates must return a state object.");
    }

    if (Object.is(nextState, state)) {
      return state;
    }

    const previousState = state;
    state = deepFreeze(nextState);

    for (const subscriber of subscribers) {
      try {
        subscriber({ state, previousState, action });
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }

    return state;
  }

  function subscribe(subscriber, { immediate = false } = {}) {
    if (typeof subscriber !== "function") {
      throw new TypeError("Store subscribers must be functions.");
    }

    subscribers.add(subscriber);

    if (immediate) {
      subscriber({ state, previousState: state, action: "state/subscribe" });
    }

    return () => subscribers.delete(subscriber);
  }

  return Object.freeze({ getState, setState, subscribe });
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return value;
  }

  seen.add(value);
  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue, seen);
  }

  return Object.freeze(value);
}
