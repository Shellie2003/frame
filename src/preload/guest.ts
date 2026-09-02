/**
 * Préchargement injecté dans chaque vue appareil.
 * Il ne sert qu'à faire remonter la position de défilement vers l'hôte et à la rejouer,
 * pour que les appareils restent synchronisés.
 */
import { ipcRenderer } from 'electron';

let applying = false;

function ratio(): number {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? window.scrollY / max : 0;
}

window.addEventListener(
  'scroll',
  () => {
    if (applying) return;
    ipcRenderer.sendToHost('guest:scroll', ratio());
  },
  { passive: true },
);

ipcRenderer.on('guest:apply-scroll', (_event, value: number) => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (max <= 0) return;
  applying = true;
  window.scrollTo({ top: value * max, behavior: 'instant' as ScrollBehavior });
  // Le rendu du scroll est asynchrone : on relâche le verrou après la frame courante.
  requestAnimationFrame(() => {
    applying = false;
  });
});
