/**
 * Cartoon outlines, the same on everything: the scene is rendered once for colour and
 * once for surface directions and depth, then a full-screen pass draws a dark line
 * wherever the depth jumps (silhouettes) or surfaces meet at a sharp angle (corners,
 * ridges, eaves). Lines soften in the distance, so far hills and clouds keep gentle outlines.
 */

import * as THREE from "three";

const LINE_COLOR = new THREE.Color("#2a2433");

export class ToonRenderer {
  private readonly color: THREE.WebGLRenderTarget;
  private readonly normals: THREE.WebGLRenderTarget;
  private readonly normalMaterial = new THREE.MeshNormalMaterial();
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  /** Outlines on (true) or off. */
  enabled = true;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.color = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
    this.normals = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.normals.depthTexture = new THREE.DepthTexture(1, 1);
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
          tColor: { value: this.color.texture },
          tNormal: { value: this.normals.texture },
          tDepth: { value: this.normals.depthTexture },
          texel: { value: new THREE.Vector2() },
          near: { value: 0.1 },
          far: { value: 1000 },
          lineColor: { value: LINE_COLOR },
          fadeFrom: { value: 80 },
          fadeTo: { value: 320 },
        },
        vertexShader: "varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: `
          uniform sampler2D tColor;
          uniform sampler2D tNormal;
          uniform sampler2D tDepth;
          uniform vec2 texel;
          uniform float near;
          uniform float far;
          uniform vec3 lineColor;
          uniform float fadeFrom;
          uniform float fadeTo;
          varying vec2 vUv;

          float viewZ(vec2 uv) {
            float d = texture2D(tDepth, uv).x;
            return (near * far) / ((far - near) * d - far) * -1.0;
          }
          vec3 normalAt(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

          void main() {
            vec4 base = texture2D(tColor, vUv);
            float z = viewZ(vUv);
            vec3 n = normalAt(vUv);
            float depthEdge = 0.0;
            float normalEdge = 0.0;
            vec2 offsets[4] = vec2[4](vec2(texel.x, 0.0), vec2(-texel.x, 0.0), vec2(0.0, texel.y), vec2(0.0, -texel.y));
            for (int i = 0; i < 4; i++) {
              vec2 uv = vUv + offsets[i];
              // Relative depth jump: silhouettes, wherever they are.
              depthEdge += max(viewZ(uv) - z, 0.0) / z;
              // Surfaces meeting at more than about 45 degrees.
              normalEdge += 1.0 - smoothstep(0.55, 0.75, dot(n, normalAt(uv)));
            }
            // Far away, grazing ground makes big relative depth jumps between pixels, so only
            // stronger jumps count there; and the lines take on the colour of what they
            // outline, so distant things keep soft outlines instead of none.
            float far = smoothstep(fadeFrom, fadeTo, z);
            float edge = max(smoothstep(0.04 + 0.12 * far, 0.09 + 0.2 * far, depthEdge), clamp(normalEdge, 0.0, 1.0));
            vec3 line = mix(lineColor, base.rgb * 0.62, far);
            gl_FragColor = vec4(mix(base.rgb, line, edge * 0.85), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /** Render `scene` into whatever target the renderer is set to (the screen or an image). */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const r = this.renderer;
    const output = r.getRenderTarget();
    if (!this.enabled) {
      r.render(scene, camera);
      return;
    }
    const size = output ? new THREE.Vector2(output.width, output.height) : r.getDrawingBufferSize(new THREE.Vector2());
    if (this.color.width !== size.x || this.color.height !== size.y) {
      this.color.setSize(size.x, size.y);
      this.normals.setSize(size.x, size.y);
    }
    const u = this.quad.material.uniforms;
    u.texel.value.set(1 / size.x, 1 / size.y);
    u.near.value = camera.near;
    u.far.value = camera.far;

    r.setRenderTarget(this.color);
    r.render(scene, camera);

    // Directions and depth: everything opaque, even glass and water, so they get outlines too.
    const background = scene.background;
    const clearColor = r.getClearColor(new THREE.Color());
    const clearAlpha = r.getClearAlpha();
    scene.background = null;
    // Things that only cast shadows must not show up as outlines.
    const ghosts: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.userData.shadowOnly && o.visible) ghosts.push(o);
    });
    for (const g of ghosts) g.visible = false;
    scene.overrideMaterial = this.normalMaterial;
    r.setRenderTarget(this.normals);
    r.setClearColor(0x8080ff, 1);
    r.clear();
    r.render(scene, camera);
    scene.overrideMaterial = null;
    for (const g of ghosts) g.visible = true;
    scene.background = background;
    r.setClearColor(clearColor, clearAlpha);

    r.setRenderTarget(output);
    r.render(this.quadScene, this.quadCamera);
  }
}
