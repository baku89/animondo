// Dump every {artist}_centers comp's nulls as JSON, for
// scripts/build-tile-centers.py.
//
// Run inside AE (File > Scripts > Run Script File...) with the project
// open. Writes straight to centers.txt beside the repo's package.json — no
// dialogs, so it can also be driven from outside AE (osascript
// DoScriptFile). Each null is sampled at the first eight frames; which
// cell of the 3x2 sheet it sits over decides which tile it tracks, so
// layer names (and their "up 2" duplicate suffixes) do not matter. A null
// over the Vanish cell gives that artist its own vanish track; artists
// without one keep the shared trace in utils/tileCenters.ts, as every
// appear still does.
(function () {
	var FRAMES = 8;

	var comps = [];
	for (var i = 1; i <= app.project.numItems; i++) {
		var item = app.project.item(i);
		if (item instanceof CompItem && /_centers$/.test(item.name)) {
			comps.push(item);
		}
	}
	if (comps.length === 0) {
		alert('No comps named "*_centers" in this project.');
		return;
	}

	var out = [];
	var exported = [];
	for (var c = 0; c < comps.length; c++) {
		var comp = comps[c];
		var artist = comp.name.replace(/_centers$/, '');

		var layers = [];
		for (var l = 1; l <= comp.numLayers; l++) {
			var layer = comp.layer(l);
			if (layer.nullLayer) layers.push(layer);
		}
		if (layers.length === 0) {
			alert(comp.name + ': no null layers — skipped.');
			continue;
		}

		var layerJson = [];
		for (var n = 0; n < layers.length; n++) {
			var pos = layers[n].property('Position');
			var points = [];
			for (var f = 0; f < FRAMES; f++) {
				var v = pos.valueAtTime(f * comp.frameDuration, false);
				points.push('[' + v[0] + ', ' + v[1] + ']');
			}
			layerJson.push(
				'\t\t\t{"name": "' + layers[n].name + '", "points": [' +
					points.join(', ') + ']}'
			);
		}

		out.push(
			'\t"' + artist + '": {\n' +
				'\t\t"width": ' + comp.width + ',\n' +
				'\t\t"height": ' + comp.height + ',\n' +
				'\t\t"layers": [\n' + layerJson.join(',\n') + '\n\t\t]\n' +
				'\t}'
		);
		exported.push(artist);
	}

	var json = '{\n' + out.join(',\n') + '\n}\n';

	// This script lives in <repo>/scripts/; the export lands at the repo
	// root, where build-tile-centers.py expects it
	var file = new File(new File($.fileName).parent.parent.fsName + '/centers.txt');
	file.encoding = 'UTF-8';
	file.open('w');
	file.write(json);
	file.close();
})();
