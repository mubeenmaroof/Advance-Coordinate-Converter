/**
 * GIS Web Worker for Heavy GIS Tasks
 * Handles Shapefile parsing and combination off the main thread.
 */

importScripts('https://cdnjs.cloudflare.com/ajax/libs/shpjs/4.0.2/shp.min.js');

self.onmessage = async function (e) {
  const { type, buffers } = e.data;

  if (type === 'parseShp') {
    try {
      self.postMessage({ type: 'status', message: 'Parsing Shapefile components...' });
      
      // shpjs.parseShp and parseDbf are synchronous but run in worker
      const parsedShp = shp.parseShp(buffers.shp);
      const parsedDbf = shp.parseDbf(buffers.dbf);
      
      self.postMessage({ type: 'status', message: 'Combining GIS data...' });
      const geojson = shp.combine([parsedShp, parsedDbf]);
      
      // Return result
      self.postMessage({ 
        type: 'complete', 
        geojson: geojson 
      });
    } catch (err) {
      self.postMessage({ type: 'error', error: err.message });
    }
  }
};
