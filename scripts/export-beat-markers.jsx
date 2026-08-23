// Dump After Effects markers as JSON, for scripts/build-beats.py.
//
// Run inside AE (File > Scripts > Run Script File...) with the comp open.
// If a layer is selected its layer markers are exported; with nothing
// selected, the composition markers are. Times are seconds from comp start.
(function () {
	var comp = app.project.activeItem;
	if (!(comp && comp instanceof CompItem)) {
		alert('Open the comp with the markers first.');
		return;
	}

	var markers, sourceName;
	if (comp.selectedLayers.length > 0) {
		markers = comp.selectedLayers[0].property('Marker');
		sourceName = comp.selectedLayers[0].name;
	} else {
		markers = comp.markerProperty;
		sourceName = comp.name;
	}

	if (markers.numKeys === 0) {
		alert('No markers on "' + sourceName + '".');
		return;
	}

	var times = [];
	for (var i = 1; i <= markers.numKeys; i++) {
		times.push(markers.keyTime(i));
	}

	var json =
		'{\n' +
		'\t"source": "' + sourceName + '",\n' +
		'\t"comp": "' + comp.name + '",\n' +
		'\t"frameRate": ' + comp.frameRate + ',\n' +
		'\t"count": ' + times.length + ',\n' +
		'\t"times": [\n\t\t' + times.join(',\n\t\t') + '\n\t]\n' +
		'}\n';

	var file = File.saveDialog('Save beat markers', 'JSON:*.json');
	if (!file) return;
	file.encoding = 'UTF-8';
	file.open('w');
	file.write(json);
	file.close();
	alert('Wrote ' + times.length + ' markers to\n' + file.fsName);
})();
