// Simple module-level handler for Home tab press
let homeTabPressHandler: (() => void) | null = null;

export const setHomeTabPressHandler = (handler: (() => void) | null) => {
  homeTabPressHandler = handler;
};

export const triggerHomeTabPress = () => {
  homeTabPressHandler?.();
};

