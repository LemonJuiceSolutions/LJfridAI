// Utility function to get the value of a CSS variable
const getCssVariable = (variableName: string): string => {
  const style = getComputedStyle(document.documentElement);
  const value = style.getPropertyValue(variableName);

  return value ? value.trim() : '#6571ff';
};

export { getCssVariable };
