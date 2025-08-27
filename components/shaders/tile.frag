precision mediump float;

uniform vec2 resolution;
uniform sampler2D video;

#define BIRTH 1
#define UP    2
#define RIGHT 3
#define DOWN  4
#define LEFT  5
#define DEATH 6

vec4 tile(vec2 uv, sampler2D texture, int index) {

    float indexFloat = float(index) - 1.0;

    vec2 offset = vec2(
        mod(indexFloat, 3.0),
        floor(indexFloat / 3.0)
    );
    
    return texture2D(texture, (uv + offset) / vec2(3.0, 2.0));
}


void main() {
    vec2 coord =
        (gl_FragCoord.xy / resolution - 0.5)
        * vec2(1.0, -resolution.y / resolution.x)
        * 2.0;
    
    // Sample video texture
    vec4 videoColor = tile(fract(coord), video, RIGHT);

    
    gl_FragColor = videoColor;

    // Draw a grid
    float gridY = dot(step(fract(coord), vec2(0.005)), vec2(1.0));
    gl_FragColor = mix(gl_FragColor, vec4(1.0, 0.0, 0.0, 1.0), gridY);

    // gl_FragColor = vec4(coord, 0.0, 1.0);
}