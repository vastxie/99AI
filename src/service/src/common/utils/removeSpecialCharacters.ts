export function removeSpecialCharacters(inputString) {
  return inputString.replace(/[^\w\s-]/g, '');
}
