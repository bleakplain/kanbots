export const KANBOTS_VERSION = '0.0.0';

export function versionCommand(): number {
  console.log(`kanbots ${KANBOTS_VERSION}`);
  return 0;
}
