precision mediump float;

uniform vec2 resolution;

uniform sampler2D tileMap;
uniform vec2 tileMapSize;

uniform sampler2D video0;
uniform sampler2D video1;
uniform sampler2D video2;
uniform sampler2D video3;
uniform sampler2D video4;
uniform sampler2D video5;
uniform sampler2D video6;
uniform sampler2D video7;

uniform mat3 navMatrix;

// The window into the video textures. Streaming mode shows the whole
// texture (scale 1, offset 0); the mobile atlas packs all eight frames
// into one sheet per artist, and these pick the current frame's slot.
uniform vec2 frameScale;
uniform vec2 frameOffset;

// Wrapped cell coords of the watched dancer ((-1,-1) when nobody is), and
// how far everyone else has receded toward the paper (0..1)
uniform vec2 focusCell;
uniform float focusFade;

// The crayon veil the unfocused crowd fades behind: a tiling white texture
// whose alpha carries the grain (flecks are holes). Sampled in screen space —
// scale maps gl_FragCoord to mask UV, offset is re-rolled at 12 fps on the
// main thread so the veil boils like the ink does. A 1x1 opaque white
// placeholder stands in until the image arrives, which is the old flat fade.
uniform sampler2D fadeMask;
uniform vec2 fadeMaskScale;
uniform vec2 fadeMaskOffset;

// focusFade x the veil's alpha at this fragment, set once in main() — the
// five overlap samples of a fragment must recede by the same amount
float fadeVeil;

#define TILE_NONE  0
#define TILE_BIRTH 1
#define TILE_UP    2
#define TILE_RIGHT 3
#define TILE_DOWN  4
#define TILE_LEFT  5
#define TILE_DEATH 6

// Unpack tile data from TileMap texture
// Returns: x = tile index, y = rotation, z = video index, w = flip vertical
ivec4 unpackTileData(vec2 tileCoord) {
    // Sample the packed data from tile map
    vec2 packedValue = texture2D(tileMap, tileCoord / tileMapSize).rg * 255.0;
    
    // Red channel: video index (4 bits)
    int videoIndex = int(packedValue.r);
    
    // Green channel: tile (bits 0-2), rotation (bits 3-4), flipVertical (bit 5)
    int greenValue = int(packedValue.g);
    
    // Extract tile index (bits 0-2): value mod 8
    int tileIndex = int(mod(float(greenValue), 8.0));
    
    // Extract rotation (bits 3-4): (value / 8) mod 4
    int rotation = int(mod(floor(float(greenValue) / 8.0), 4.0));
    
    // Extract flipVertical (bit 5): value / 32
    int flipVertical = int(floor(float(greenValue) / 32.0));
    
    return ivec4(tileIndex, rotation, videoIndex, flipVertical);
}

vec2 rotateUV(vec2 uv, int rotation) {
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
    return rotatedUV;
}

vec4 tile(vec2 uv, sampler2D texture, int tile, int rotation, int flipVertical) {
    float tileFloat = float(tile) - 1.0;

    vec2 offset = vec2(
        mod(tileFloat, 3.0),
        floor(tileFloat / 3.0)
    );
    // Rotate UV
    uv = rotateUV(uv, rotation);

    
    // Apply vertical flip if needed
    if (flipVertical == 1) {
        uv.y = 1.0 - uv.y;
    }
    

    // Scale UV
    uv = mix(vec2(0.25), vec2(0.75), uv);

    // If the UV is out of range, return white
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        return vec4(1.0);
    }

    return texture2D(texture, ((uv + offset) / vec2(3.0, 2.0)) * frameScale + frameOffset);
}

// Draw a single tile at given tile coordinate with UV offset
vec4 drawTileAt(vec2 tileCoord, vec2 uv) {

    // Get tile data from TileMap
    ivec4 tileData = unpackTileData(tileCoord);
    int tileIndex = tileData.x;
    int rotation = tileData.y;
    int videoIndex = tileData.z;
    int flipVertical = tileData.w;
    
    // Skip empty tiles (white)
    if (tileIndex == TILE_NONE) {
        return vec4(1.0);
    }
    
    vec4 color = vec4(1.0);
    if (videoIndex == 0) {
        color = tile(uv, video0, tileIndex, rotation, flipVertical);
    } else if (videoIndex == 1) {
        color = tile(uv, video1, tileIndex, rotation, flipVertical);
    } else if (videoIndex == 2) {
        color = tile(uv, video2, tileIndex, rotation, flipVertical);
    } else if (videoIndex == 3) {
        color = tile(uv, video3, tileIndex, rotation, flipVertical);
    } else if (videoIndex == 4) {
        color = tile(uv, video4, tileIndex, rotation, flipVertical);
    } else if (videoIndex == 5) {
        color = tile(uv, video5, tileIndex, rotation, flipVertical);
    } else if (videoIndex == 6) {
        color = tile(uv, video6, tileIndex, rotation, flipVertical);
    } else if (videoIndex == 7) {
        color = tile(uv, video7, tileIndex, rotation, flipVertical);
    }

    // While a dancer is being watched, every other tile recedes toward the
    // paper — behind the crayon veil, whose grain lets flecks of ink keep
    // glinting through. Applied per sampled tile (the overlap bleed
    // included), so the watched cell's ink is the only one left at full
    // strength.
    if (fadeVeil > 0.0 && distance(mod(tileCoord, tileMapSize), focusCell) > 0.5) {
        color = mix(color, vec4(1.0), fadeVeil);
    }

    return color;
}

// Draw overlapping tiles (current + 4 neighbors) and multiply them
vec4 drawOverlappingTiles(vec2 coord) {
    vec2 tileCoord = floor(coord);
    vec2 uv = fract(coord);
    
    // Current tile
    vec4 center = drawTileAt(tileCoord, uv);
    
    // Neighboring tiles with proper UV offsets for 0.5 overlap
    // UV coordinates need to be shifted to show the overlapping portion
    vec4 up = drawTileAt(tileCoord + vec2(0.0, 1.0), uv + vec2(0.0, -1.0));
    vec4 down = drawTileAt(tileCoord + vec2(0.0, -1.0), uv - vec2(0.0, -1.0));
    vec4 left = drawTileAt(tileCoord + vec2(1.0, 0.0), uv + vec2(-1.0, 0.0));
    vec4 right = drawTileAt(tileCoord + vec2(-1.0, 0.0), uv - vec2(-1.0, 0.0));
    
    // Only include tiles where UV is in valid overlap range
    vec4 result = center;
    
    // Top half overlaps with tile above
    result = min(result, up);
    result = min(result, down);
    result = min(result, left);
    result = min(result, right);
    
    return result;

    // return mix(result, vec4(tileCoord / tileMapSize, 0.0, 1.0), 0.5);
}

void main() {
    // Convert to normalized coordinates
    vec2 aspect = vec2(1.0, -resolution.y / resolution.x); 
    vec2 normCoord = (gl_FragCoord.xy / resolution - 0.5) * aspect * 2.0;
    
    // Apply navigation transformation
    vec2 coord = (navMatrix * vec3(normCoord, 1.0)).xy;

    // The veil's strength at this fragment, shared by the overlap samples
    fadeVeil = focusFade
        * texture2D(fadeMask, gl_FragCoord.xy * fadeMaskScale + fadeMaskOffset).a;

    // Draw overlapping tiles
    gl_FragColor = drawOverlappingTiles(coord);

    // Draw a grid
    // float grid = dot(step(fract(coord), vec2(0.02)), vec2(1.0));
    // gl_FragColor = mix(gl_FragColor, vec4(1.0, 0.0, 0.0, 1.0), grid);

    // float gridTile = dot(step(fract(coord / tileMapSize), vec2(0.02)), vec2(1.0));
    // gl_FragColor = mix(gl_FragColor, vec4(0.0, 0.0, 1.0, 1.0), gridTile);

    // gl_FragColor.rgb *= step(0.1, length(coord));
}