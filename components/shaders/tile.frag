precision mediump float;

uniform vec2 resolution;
uniform sampler2D video;

#define TILE_BIRTH 1
#define TILE_UP    2
#define TILE_RIGHT 3
#define TILE_DOWN  4
#define TILE_LEFT  5
#define TILE_DEATH 6

vec4 tile(vec2 uv, sampler2D texture, int index, int rotation) {
    // Apply rotation to UV coordinates
    // rotation: 0=0°, 1=90°, 2=180°, 3=270°
    // Note: Y-axis is already flipped in main(), so we need to adjust rotation accordingly
    vec2 rotatedUV = uv;
    
    if (rotation == 1) {
        // 90° clockwise (adjusted for flipped Y): (x,y) -> (y, 1-x)
        rotatedUV = vec2(uv.y, 1.0 - uv.x);
    } else if (rotation == 2) {
        // 180°: (x,y) -> (1-x, 1-y)
        rotatedUV = vec2(1.0 - uv.x, 1.0 - uv.y);
    } else if (rotation == 3) {
        // 270° clockwise (adjusted for flipped Y): (x,y) -> (1-y, x)
        rotatedUV = vec2(1.0 - uv.y, uv.x);
    }
    
    float indexFloat = float(index) - 1.0;

    vec2 offset = vec2(
        mod(indexFloat, 3.0),
        floor(indexFloat / 3.0)
    );
    
    return texture2D(texture, (rotatedUV + offset) / vec2(3.0, 2.0));
}


void main() {
    vec2 coord =
        (gl_FragCoord.xy / resolution - 0.5)
        * vec2(1.0, -resolution.y / resolution.x)
        * 2.0;
    
    // Sample video texture
    vec4 videoColor = tile(fract(coord), video, TILE_RIGHT, 0);

    
    gl_FragColor = videoColor;

    // Draw a grid
    float gridY = dot(step(fract(coord), vec2(0.005)), vec2(1.0));
    gl_FragColor = mix(gl_FragColor, vec4(1.0, 0.0, 0.0, 1.0), gridY);

    // gl_FragColor = vec4(coord, 0.0, 1.0);
}