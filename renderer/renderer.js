const stage = document.querySelector('#pet-stage');
const sprite = document.querySelector('#sprite');

const NATIVE_WALK_FRAMES = 18;
const NATIVE_WALK_CYCLE_SECONDS = 1.5;

const animations = {
  idle: { row: 0, start: 0, frames: 18, fps: 9.6, loop: true },
  // A full native gait now spans 1.5 seconds. At the default movement speed
  // this advances about 108 px per cycle, so planted paws no longer race.
  walk: {
    row: 1,
    start: 0,
    frames: NATIVE_WALK_FRAMES,
    fps: NATIVE_WALK_FRAMES / NATIVE_WALK_CYCLE_SECONDS,
    loop: true
  },
  eat: { row: 2, start: 0, frames: 18, fps: 16.5, loop: true },
  drag: { row: 3, start: 0, frames: 18, fps: 12, loop: true },
  'ride-front': { row: 0, start: 0, frames: 18, fps: 18, loop: true, sheet: 'ride-front' },
  'ride-rear': { row: 0, start: 0, frames: 18, fps: 18, loop: true, sheet: 'ride-rear' },
  fall: { row: 4, start: 0, frames: 9, fps: 18, loop: false },
  land: { row: 4, start: 9, frames: 7, fps: 18, loop: false }
};

let animation = animations.idle;
let state = 'idle';
let frame = 0;
let lastFrameAt = performance.now();
let dragging = false;
let activePointer = null;
let downAt = 0;
let repetitionsRemaining = Infinity;

function renderFrame() {
  const absoluteFrame = animation.start + frame;
  const x = absoluteFrame / 17 * 100;
  const y = animation.sheet?.startsWith('ride-') ? 0 : animation.row / 4 * 100;
  sprite.dataset.frame = String(frame);
  sprite.style.backgroundPosition = `${x}% ${y}%`;
}

function setState(nextState, facing = 'left', repetitions) {
  state = nextState in animations ? nextState : 'idle';
  animation = animations[state];
  frame = 0;
  repetitionsRemaining = Number.isInteger(repetitions) && repetitions > 0
    ? repetitions
    : Infinity;
  lastFrameAt = performance.now();
  sprite.dataset.state = state;
  sprite.classList.toggle('ride-front', state === 'ride-front');
  sprite.classList.toggle('ride-rear', state === 'ride-rear');
  sprite.classList.toggle('facing-right', facing === 'right' && !state.startsWith('ride-'));
  renderFrame();
}

function animate(now) {
  const interval = 1000 / animation.fps;
  if (now - lastFrameAt >= interval) {
    const steps = Math.floor((now - lastFrameAt) / interval);
    if (animation.loop) {
      const previousFrame = frame;
      frame = (frame + steps) % animation.frames;
      const completedCycles = Math.floor((previousFrame + steps) / animation.frames);
      if (Number.isFinite(repetitionsRemaining) && completedCycles > 0) {
        repetitionsRemaining -= completedCycles;
        if (repetitionsRemaining <= 0) {
          repetitionsRemaining = Infinity;
          const completedState = state;
          frame = animation.frames - 1;
          renderFrame();
          window.desktopPet.animationComplete(completedState);
          requestAnimationFrame(animate);
          return;
        }
      }
    } else {
      frame = Math.min(frame + steps, animation.frames - 1);
    }
    lastFrameAt += steps * interval;
    renderFrame();
  }
  requestAnimationFrame(animate);
}

stage.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  dragging = true;
  activePointer = event.pointerId;
  downAt = performance.now();
  stage.classList.add('dragging');
  stage.setPointerCapture(event.pointerId);
  window.desktopPet.startDrag({ x: event.clientX, y: event.clientY });
});

stage.addEventListener('pointerup', (event) => {
  if (!dragging || event.pointerId !== activePointer) return;
  dragging = false;
  activePointer = null;
  stage.classList.remove('dragging');
  if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  window.desktopPet.endDrag();
});

stage.addEventListener('pointercancel', () => {
  if (!dragging) return;
  dragging = false;
  activePointer = null;
  stage.classList.remove('dragging');
  window.desktopPet.endDrag();
});

stage.addEventListener('dblclick', (event) => {
  event.preventDefault();
  if (performance.now() - downAt < 650) window.desktopPet.feed();
});

stage.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.desktopPet.showMenu();
});

window.desktopPet.onState(({ state: nextState, facing, repetitions }) => {
  setState(nextState, facing, repetitions);
});

renderFrame();
requestAnimationFrame(animate);
