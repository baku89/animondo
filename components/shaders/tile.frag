precision mediump float;

uniform vec2 resolution;

uniform sampler2D tileMap;
uniform vec2 tileMapSize;

uniform sampler2D video0;
uniform sampler2D video1;
uniform sampler2D video2;

uniform mat3 navMatrix;

#define TILE_NONE  0
#define TILE_BIRTH 1
#define TILE_UP    2
#define TILE_RIGHT 3
#define TILE_DOWN  4
#define TILE_LEFT  5
#define TILE_DEATH 6

// Unpack tile data from TileMap texture
// Returns: x = tile index, y = rotation, z = video index
ivec3 unpackTileData(vec2 tileCoord) {
    // Sample the packed data from tile map
    float packedValue = texture2D(tileMap, tileCoord / tileMapSize).r * 255.0;
    
    // Unpack: tile (bits 0-2), rotation (bits 3-4), videoIndex (bits 5-7)
    int tileIndex = int(mod(packedValue, 8.0));
    int rotation = int(mod(floor(packedValue / 8.0), 4.0));
    int videoIndex = int(floor(packedValue / 32.0));
    
    return ivec3(tileIndex, rotation, videoIndex);
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

    // If the UV is out of range, return white
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        return vec4(1.0);
    }

    return texture2D(texture, (uv + offset) / vec2(3.0, 2.0));
}

// Draw a single tile at given tile coordinate with UV offset
vec4 drawTileAt(vec2 tileCoord, vec2 uv) {

    // Get tile data from TileMap
    ivec3 tileData = unpackTileData(tileCoord);
    int tileIndex = tileData.x;
    int rotation = tileData.y;
    int videoIndex = tileData.z;
    
    // Skip empty tiles (white)
    if (tileIndex == TILE_NONE) {
        return vec4(1.0);
    }
    
    // TODO: Use videoIndex to select from video array
    // For now, use the single video texture
   if (videoIndex == 0) {
        return tile(uv, video0, tileIndex, rotation);
   } else if (videoIndex == 1) {
        return tile(uv, video1, tileIndex, rotation);
   } else {
        return tile(uv, video2, tileIndex, rotation);
   }
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
    result *= up;
    result *= down;
    result *= left;
    result *= right;
    
    return result;

    // return mix(result, vec4(tileCoord / tileMapSize, 0.0, 1.0), 0.5);
}

void main() {
    // Convert to normalized coordinates
    vec2 aspect = vec2(1.0, -resolution.y / resolution.x); 
    vec2 normCoord = (gl_FragCoord.xy / resolution - 0.5) * aspect * 2.0;
    
    // Apply navigation transformation
    vec2 coord = (navMatrix * vec3(normCoord, 1.0)).xy;

    // Draw overlapping tiles
    gl_FragColor = drawOverlappingTiles(coord);

    // Draw a grid
    // float grid = dot(step(fract(coord), vec2(0.02)), vec2(1.0));
    // gl_FragColor = mix(gl_FragColor, vec4(1.0, 0.0, 0.0, 1.0), grid);

    // float gridTile = dot(step(fract(coord / tileMapSize), vec2(0.02)), vec2(1.0));
    // gl_FragColor = mix(gl_FragColor, vec4(0.0, 0.0, 1.0, 1.0), gridTile);

    // gl_FragColor.rgb *= step(0.1, length(coord));
}