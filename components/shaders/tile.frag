precision mediump float;

uniform vec2 resolution;
uniform sampler2D video;
uniform sampler2D tileMap;
uniform vec2 tileMapSize;

#define TILE_BIRTH 1
#define TILE_UP    2
#define TILE_RIGHT 3
#define TILE_DOWN  4
#define TILE_LEFT  5
#define TILE_DEATH 6

// Unpack tile data from TileMap texture
// Returns: x = tile index, y = rotation
ivec2 unpackTileData(vec2 tileCoord) {
    // Sample the packed data from tile map
    float packedValue = texture2D(tileMap, tileCoord / tileMapSize).r * 255.0;
    
    // Unpack: tile (lower 4 bits), rotation (bits 4-5)
    int tileIndex = int(mod(packedValue, 16.0));
    int rotation = int(floor(packedValue / 16.0));
    
    return ivec2(tileIndex, rotation);
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

vec4 tile(vec2 uv, sampler2D texture, int index, int rotation) {
    float indexFloat = float(index) - 1.0;

    vec2 offset = vec2(
        mod(indexFloat, 3.0),
        floor(indexFloat / 3.0)
    );
    
    // Rotate UV
    uv = rotateUV(uv, rotation);
    // Scale UV
    uv = mix(vec2(0.25), vec2(0.75), uv);
    // Clamp UV to 0-1 range
    uv = clamp(uv, vec2(0.0), vec2(1.0));

    return texture2D(texture, (uv + offset) / vec2(3.0, 2.0));
}

// Draw a single tile at given tile coordinate with UV offset
vec4 drawTileAt(vec2 tileCoord, vec2 uv) {
    // Get tile data from TileMap
    ivec2 tileData = unpackTileData(tileCoord);
    int tileIndex = tileData.x;
    int rotation = tileData.y;
    
    // Skip empty tiles
    if (tileIndex == 0) {
        return vec4(0.0, 0.0, 0.0, 0.0);
    }
    
    // Sample video texture with tile and rotation
    return tile(uv, video, tileIndex, rotation);
}

// Draw overlapping tiles (current + 4 neighbors) and multiply them
vec4 drawOverlappingTiles(vec2 coord) {
    vec2 tileCoord = floor(coord);
    vec2 uv = fract(coord);
    
    // Current tile
    vec4 center = drawTileAt(tileCoord, uv);
    
    // Neighboring tiles with proper UV offsets for 0.5 overlap
    // UV coordinates need to be shifted to show the overlapping portion
    vec4 up = drawTileAt(tileCoord + vec2(0.0, 1.0), uv + vec2(0.0, 1.0));
    vec4 down = drawTileAt(tileCoord + vec2(0.0, -1.0), uv - vec2(0.0, 1.0));
    vec4 left = drawTileAt(tileCoord + vec2(-1.0, 0.0), uv + vec2(1.0, 0.0));
    vec4 right = drawTileAt(tileCoord + vec2(1.0, 0.0), uv - vec2(1.0, 0.0));
    
    // Only include tiles where UV is in valid overlap range
    vec4 result = center;
    
    // Top half overlaps with tile above
    result *= up;
    result *= down;
    result *= left;
    result *= right;
    
    return result;
}


void main() {
    // Convert to tile coordinates
    vec2 coord =
        (gl_FragCoord.xy / resolution - 0.5)
        * vec2(1.0, -resolution.y / resolution.x)
        * 4.0;

    // Draw overlapping tiles
    vec4 videoColor = drawOverlappingTiles(coord);
    
    gl_FragColor = videoColor;

    // Draw a grid
    // float gridY = dot(step(fract(coord), vec2(0.005)), vec2(1.0));
    // gl_FragColor = mix(gl_FragColor, vec4(1.0, 0.0, 0.0, 1.0), gridY);
}