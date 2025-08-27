precision mediump float;
attribute vec2 position;
varying vec2 uv;

void main() {
	uv = position / 2.0 + 0.5;
	gl_Position = vec4(position, 0, 1);
}