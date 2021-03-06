// Copied from https://gist.github.com/bsergean/6780d7cc0cabb1b4d6c8
const THREE = require('three');
const PNG = require('pngjs').PNG;
const gl = require('gl')();
const fs = require('fs');

const DEFAULT_VERTEX_SHADER = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const DEFAULT_FRAGMENT_SHADER = `
uniform vec2 resolution;
uniform float time;
void main() {
  vec2 pos = gl_FragCoord.xy / resolution.xy;
  float d = distance(pos, vec2(0.5)) + sin(time) * 0.1;
  float c = 1.0 - smoothstep(0.5, 0.501, d);
  gl_FragColor = vec4(0.0, c, c, 1.0);
}
`;

class Converter {
  // eslint-disable-next-line max-params
  constructor (width = 600, height = 400, fsPath, time, uniform) {
    this.width = width;
    this.height = height;
    this.time = time;
    this.uniform = {};

    try {
      this.uniform = JSON.parse(uniform || '{}');
    } catch (e) {
      console.error('Failed to parse uniform option.');
    }

    this.scene = new THREE.Scene();
    this.createCamera();
    this.createTarget();
    this.fragmentShader = fs.readFileSync(fsPath, 'utf8');
    this.createRenderer();
    this.createPlane();

    this.png = new PNG({ width: width, height: height });
  }

  get aspect () {
    return this.width / this.height;
  }

  createCamera () {
    this.camera = new THREE.OrthographicCamera(-this.aspect, this.aspect, 1, -1, 0.1, 10);
    this.scene.add(this.camera);
    this.camera.position.set(0, 0, 1);
    this.camera.lookAt(this.scene.position);
  }

  createTarget () {
    // Let's create a render target object where we'll be rendering
    this.rtTexture = new THREE.WebGLRenderTarget(
      this.width,
      this.height,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
      }
    );
  }

  createRenderer () {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      width: 0, // The width / height we set here doesn't matter
      height: 0,
      context: gl, // Mock context with headless-gl
      canvas: {
        getContext: () => gl,
      },
    });
  }

  createPlane () {
    const DEFAULT_UNIFORMS = {
      time: { type: 'f', value: this.time || 0.0 },
      resolution: { type: 'v2', value: new THREE.Vector2(this.width, this.height) },
      mouse: { type: 'v2', value: new THREE.Vector2(this.width * 0.5, this.height * 0.5) },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: DEFAULT_VERTEX_SHADER,
      fragmentShader: this.fragmentShader || DEFAULT_FRAGMENT_SHADER,
      uniforms: Object.assign(DEFAULT_UNIFORMS, this.uniform),
    });

    const geometry = new THREE.PlaneGeometry(2 * this.aspect, 2);
    const plane = new THREE.Mesh(geometry, material);
    this.scene.add(plane);
  }

  render (path = 'out.png') {
    this.renderer.render(this.scene, this.camera, this.rtTexture, true);

    const ctx = this.renderer.getContext();
    const pixels = new Uint8Array(4 * this.width * this.height);
    ctx.readPixels(0, 0, this.width, this.height, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels);

    // Lines are vertically flipped in the FBO / need to unflip them
    for (let j = 0; j < this.height; j++) {
      for (let i = 0; i < this.width; i++) {
        const k = j * this.width + i;
        const r = pixels[4 * k + 0];
        const g = pixels[4 * k + 1];
        const b = pixels[4 * k + 2];
        const a = pixels[4 * k + 3];

        const m = (this.height - j - 1) * this.width + i;
        this.png.data[4 * m + 0] = r;
        this.png.data[4 * m + 1] = g;
        this.png.data[4 * m + 2] = b;
        this.png.data[4 * m + 3] = a;
      }
    }

    // Now write the png to disk
    const stream = fs.createWriteStream(path);
    this.png.pack().pipe(stream);

    stream.on('close', () => {
      console.log(`Image written: ${path}`);
    });

    return new Promise((resolve, reject) => {
      stream.on('close', () => resolve(path));
      stream.on('errror', e => reject(e));
    });
  }
}

module.exports = Converter;
