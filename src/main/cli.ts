export interface CliOptions {
  /** URL passée en argument, chargée au démarrage à la place de la dernière URL retenue. */
  url: string | null;
  /** Mode vérification : l'application se ferme d'elle-même après ses contrôles. */
  smoke: boolean;
}

/**
 * `argv` est déjà débarrassé du binaire et, en développement, du chemin de l'application.
 */
export function parseCli(argv: readonly string[]): CliOptions {
  let url: string | null = null;
  let smoke = false;
  for (const arg of argv) {
    if (arg === '--smoke') smoke = true;
    else if (/^(https?|file):\/\//i.test(arg)) url ??= arg;
  }
  return { url, smoke };
}

/** Retire de process.argv le binaire Electron et, hors paquet, le chemin du projet. */
export function userArgs(argv: readonly string[], defaultApp: boolean): string[] {
  return argv.slice(defaultApp ? 2 : 1).filter((arg) => !arg.startsWith('--enable-') && arg !== '--no-sandbox');
}
