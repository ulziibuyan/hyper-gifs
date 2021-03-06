
// Our extension's custom redux middleware. Here we can intercept redux actions and respond to them.
exports.middleware = (store) => (next) => (action) => {
  // the redux `action` object contains a loose `type` string, the
  // 'SESSION_ADD_DATA' type identifier corresponds to an action in which
  // the terminal wants to output information to the GUI.
  if ('SESSION_ADD_DATA' === action.type) {
    // 'SESSION_ADD_DATA' actions hold the output text data in the `data` key.
    const { data } = action;
    const enterKey = data.indexOf('\n') > 0;
    if (enterKey) {
      if (path = detectWowCommand(data)) {
        // Here, we are responding to 'wow' being input at the prompt. Since we don't
        // want the "unknown command" output being displayed to the user, we don't thunk the next
        // middleware by calling `next(action)`. Instead, we dispatch a new action 'WOW_MODE_TOGGLE'.
        store.dispatch({
          type: 'WOW_MODE_TOGGLE',
          path: path
        });
        setTimeout(function() {
          store.dispatch({
            type: 'WOW_MODE_TOGGLE',
            path: path
          });
        }, 10000);
      }
    }
    next(action);
  } else {
    next(action);
  }
};

// This function performs regex matching on expected shell output for 'wow' being input
// at the command line. Currently it supports output from bash, zsh, fish, cmd and powershell.
function detectWowCommand(data) {
  const gifs = {
    "clone"     : 'https://media.giphy.com/media/3o7WIEKfJsq2oLapTG/giphy.gif',
    "commit"    : 'https://media.giphy.com/media/fQx9CCJMFtX4txFRef/giphy.gif',
    "push"      : 'https://media.giphy.com/media/xT0BKnwxcXLm8tyjgk/giphy.gif',
    "checkout"  : 'https://media.giphy.com/media/LaMsiCZxwc0hy/giphy.gif',
    "init"      : 'https://media.giphy.com/media/p05aTOLVCQNR6/giphy.gif'
  };
  // https://media.giphy.com/media/1n4FT4KRQkDvK0IO4X/giphy.gif
  key = data.match('(' + Object.keys(gifs).join(')|(') + ')');
  if (key) {
    return gifs[key[0]];
  }
  return null;
}

// Our extension's custom ui state reducer. Here we can listen for our 'WOW_MODE_TOGGLE' action
// and modify the state accordingly.
exports.reduceUI = (state, action) => {
  switch (action.type) {
    case 'WOW_MODE_TOGGLE':
      // Toggle wow mode!
      return state.set('gif', action.path).set('wowMode', !state.wowMode);
  }
  return state;
};

// Our extension's state property mapper. Here we can pass the ui's `wowMode` state
// into the terminal component's properties.
exports.mapTermsState = (state, map) => {
  return Object.assign(map, {
    wowMode: state.ui.wowMode,
    gif: state.ui.gif
  });
};

// We'll need to handle reflecting the `wowMode` property down through possible nested
// parent/children terminal hierarchies.
const passProps = (uid, parentProps, props) => {
  return Object.assign(props, {
    wowMode: parentProps.wowMode,
    gif: parentProps.gif
  });
}

exports.getTermGroupProps = passProps;
exports.getTermProps = passProps;

// The `decorateTerm` hook allows our extension to return a higher order react component.
// It supplies us with:
// - Term: The terminal component.
// - React: The enture React namespace.
// - notify: Helper function for displaying notifications in the operating system.
//
// The portions of this code dealing with the particle simulation are heavily based on:
// - https://atom.io/packages/power-mode
// - https://github.com/itszero/rage-power/blob/master/index.jsx
exports.decorateTerm = (Term, { React, notify }) => {
  // Define and return our higher order component.
  return class extends React.Component {
    constructor (props, context) {
      super(props, context);
      // Since we'll be passing these functions around, we need to bind this
      // to each.
      // this._drawFrame = this._drawFrame.bind(this);
      // this._resizeCanvas = this._resizeCanvas.bind(this);
      this._onDecorated = this._onDecorated.bind(this);
      // this._onCursorMove = this._onCursorMove.bind(this);
      // this._shake = throttle(this._shake.bind(this), 100, { trailing: false });
      // this._spawnParticles = throttle(this._spawnParticles.bind(this), 25, { trailing: false });
      // Initial particle state
      this._particles = [];
      // We'll set these up when the terminal is available in `_onDecorated`
      this._div = null;
      this._canvas = null;
    }

    _onDecorated (term) {
      if (this.props.onDecorated) this.props.onDecorated(term);
      this._div = term ? term.termRef : null;
      // this._initCanvas();
    }

    // Set up our canvas element we'll use to do particle effects on.
    _initCanvas () {
      this._canvas = document.createElement('canvas');
      this._canvas.style.position = 'absolute';
      this._canvas.style.top = '0';
      this._canvas.style.pointerEvents = 'none';
      this._canvasContext = this._canvas.getContext('2d');
      this._canvas.width = window.innerWidth;
      this._canvas.height = window.innerHeight;
      document.body.appendChild(this._canvas);
      window.requestAnimationFrame(this._drawFrame);
      window.addEventListener('resize', this._resizeCanvas);
    }

    _resizeCanvas () {
      this._canvas.width = window.innerWidth;
      this._canvas.height = window.innerHeight;
    }

    // Draw the next frame in the particle simulation.
    _drawFrame () {
      this._particles.length && this._canvasContext.clearRect(0, 0, this._canvas.width, this._canvas.height);
      this._particles.forEach((particle) => {
        particle.velocity.y += PARTICLE_GRAVITY;
        particle.x += particle.velocity.x;
        particle.y += particle.velocity.y;
        particle.alpha *= PARTICLE_ALPHA_FADEOUT;
        this._canvasContext.fillStyle = `rgba(${particle.color.join(',')}, ${particle.alpha})`;
        this._canvasContext.fillRect(Math.round(particle.x - 1), Math.round(particle.y - 1), 3, 3);
      });
      this._particles = this._particles
        .slice(Math.max(this._particles.length - MAX_PARTICLES, 0))
        .filter((particle) => particle.alpha > 0.1);
      if (this._particles.length > 0 || this.props.needsRedraw) {
        window.requestAnimationFrame(this._drawFrame);
      }
      this.props.needsRedraw = this._particles.length === 0;
    }

    // Pushes `PARTICLE_NUM_RANGE` new particles into the simulation.
    _spawnParticles (x, y) {
      // const { colors } = this.props;
      const length = this._particles.length;
      const colors = this.props.wowMode
        ? values(this.props.colors).map(toHex)
        : [toHex(this.props.cursorColor)];
      const numParticles = PARTICLE_NUM_RANGE();
      for (let i = 0; i < numParticles; i++) {
        const colorCode = colors[i % colors.length];
        const r = parseInt(colorCode.slice(1, 3), 16);
        const g = parseInt(colorCode.slice(3, 5), 16);
        const b = parseInt(colorCode.slice(5, 7), 16);
        const color = [r, g, b];
        this._particles.push(this._createParticle(x, y, color));
      }
      if (length === 0) {
        window.requestAnimationFrame(this._drawFrame);
      }
    }

    // Returns a particle of a specified color
    // at some random offset from the input coordinates.
    _createParticle (x, y, color) {
      return {
        x,
        y: y,
        alpha: 1,
        color,
        velocity: {
          x: PARTICLE_VELOCITY_RANGE.x[0] + Math.random() *
            (PARTICLE_VELOCITY_RANGE.x[1] - PARTICLE_VELOCITY_RANGE.x[0]),
          y: PARTICLE_VELOCITY_RANGE.y[0] + Math.random() *
            (PARTICLE_VELOCITY_RANGE.y[1] - PARTICLE_VELOCITY_RANGE.y[0])
        }
      };
    }

    // 'Shakes' the screen by applying a temporary translation
    // to the terminal container.
    _shake () {
      // TODO: Maybe we should do this check in `_onCursorMove`?
      if(!this.props.wowMode) return;

      const intensity = 1 + 2 * Math.random();
      const x = intensity * (Math.random() > 0.5 ? -1 : 1);
      const y = intensity * (Math.random() > 0.5 ? -1 : 1);
      this._div.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      setTimeout(() => {
        if (this._div) this._div.style.transform = '';
      }, 75);
    }

    _onCursorMove (cursorFrame) {
      if (this.props.onCursorMove) this.props.onCursorMove(cursorFrame);
      this._shake();
      const { x, y } = cursorFrame;
      const origin = this._div.getBoundingClientRect();
      requestAnimationFrame(() => {
        this._spawnParticles(x + origin.left, y + origin.top);
      });
    }

    // Called when the props change, here we'll check if wow mode has gone
    // on -> off or off -> on and notify the user accordingly.
    componentWillReceiveProps (next) {
      if (next.wowMode && !this.props.wowMode) {
        this._div.style.cssText = `
          background: url(` + next.gif + `);
          background-position: bottom right;
          background-repeat: no-repeat;
        `;
      } else if (!next.wowMode && this.props.wowMode) {
        this._div.style.cssText = `
          background: none
        `;
      }
    }

    render () {
      // Return the default Term component with our custom onTerminal closure
      // setting up and managing the particle effects.
      return React.createElement(Term, Object.assign({}, this.props, {
        onDecorated: this._onDecorated,
        // onCursorMove: this._onCursorMove
      }));
    }

    componentWillUnmount () {
      document.body.removeChild(this._canvas);
    }
  }
};
