// Keyboard and mouse state, sampled once per frame into a plain input object
// the simulation steps from. The staged screenshot scenes build the same
// shape by hand, so the game cannot tell a scripted driver from a person.

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    held.add(event.code);
    pressed.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  /** The input object for one frame; clears the one-frame edges. */
  function sample() {
    const frame = {
      up: held.has('KeyW') || held.has('ArrowUp'),
      down: held.has('KeyS') || held.has('ArrowDown'),
      left: held.has('KeyA') || held.has('ArrowLeft'),
      right: held.has('KeyD') || held.has('ArrowRight'),
      run: held.has('ShiftLeft') || held.has('ShiftRight'),
      handbrake: held.has('Space'),
      enter: pressed.has('KeyE') || pressed.has('KeyF'),
      start: pressed.has('Enter'),
      pause: pressed.has('KeyP') || pressed.has('Escape'),
      help: pressed.has('KeyH'),
      mute: pressed.has('KeyM'),
      restart: pressed.has('KeyR'),
      fire: mouse.down,
      aimX: mouse.x,
      aimY: mouse.y,
      clicked: mouse.clicked,
    };
    pressed.clear();
    mouse.clicked = false;
    return frame;
  }

  return { sample };
}

/** A neutral input object, for staged scenes and tests to edit. */
export function blankInput() {
  return {
    up: false, down: false, left: false, right: false, run: false,
    handbrake: false, enter: false, start: false, pause: false,
    help: false, mute: false, restart: false, fire: false,
    aimX: 0, aimY: 0, clicked: false,
  };
}
