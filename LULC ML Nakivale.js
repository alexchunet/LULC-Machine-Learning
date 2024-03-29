
var countries = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');
var region = countries.filter(ee.Filter.eq('country_na', 'Uganda'));

var dataset = ee.ImageCollection('LANDSAT/LC08/C01/T1_SR')
   .filterBounds(region)

function maskL8sr(dataset) {
   var cloudShadowBitMask = 1 << 3;
   var cloudsBitMask = 1 << 5;

   var qa = dataset.select('pixel_qa');

   var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
         .and(qa.bitwiseAnd(cloudsBitMask).eq(0));

   return dataset.updateMask(mask).divide(10000)
	.select("B[0-9]*")
	.copyProperties(dataset, ["system:time_start"]);
}

var SumFilter = ee.Filter.date('2018-01-01','2018-12-30');
var allsum = dataset.filter(SumFilter);

// Make a composite , apply mask function, median reducer and clipping to our area of interest
var image = allsum
              .map(maskL8sr)
      	      .median();
      	      //.clip(AOI);

var visualization = {
  min: 0.0,
  max: 0.3,
  bands: ['B4', 'B3', 'B2']
  //gamma: 1.1
};


Map.addLayer(image, visualization, 'RGB');
Map.centerObject(roi,7);


// create training data set 
var training = water.merge(green).merge(urban).merge(barren).merge(prairie);
//print(training.limit(10));

var label = 'class';
//var bands = ['B2','B3','B4','B8'];
var bands = ['B3','B4','B5','B6','B7'];
var input = image.select(bands);

// overlay the points of the imagery to get training (35mn)

var trainImage = input.sampleRegions({
  collection: training,
  properties: [label],
  scale: 30
});

// separate training and validing data 
var trainingdata = trainImage.randomColumn();
var trainSet = trainingdata.filter(ee.Filter.lessThan('random',0.8));
var testSet = trainingdata.filter(ee.Filter.greaterThanOrEquals('random',0.8));


// // Classification model

// define CART Classifier
var classifierCART = ee.Classifier.smileCart().train(trainSet, label, bands);

// Create an SVM classifier with custom parameters.
var define_classifierSVM = ee.Classifier.libsvm({
  kernelType: 'RBF', // Radian based function 
  gamma: 0.5,
  cost: 10
});

var classifierSVM = define_classifierSVM.train(trainSet, label, bands);

//  Define random forest classifier 

var define_classifierRF = ee.Classifier.smileRandomForest({
  numberOfTrees:10,
  seed: 1
});

//var NumberTrees = [5, 10, 15, 20, 25, 30, 35, 40];
//var accuracy = [0.9695, 0.9695, 0.9695, 0.9695, 0.9695, 0.9756, 0.9695, 0.9695];    

// var tuning = ee.Array([[5,0.9695], [10,0.9695], [15,0.9695], [20,0.9695], [25,0.9695], [30,0.9756], [35,0.9695], [40,0.9695]]);
// print('test',tuning);

var classifierRF= define_classifierRF.train(trainSet, label, bands);

// Define Naive Bayes classifier 

var classifierNB = ee.Classifier.smileNaiveBayes().train(trainSet, label, bands);


//*****************************
// // Classify the image 

var classifiedCART = input.classify(classifierCART);
var classifiedSVM = input.classify(classifierSVM);
var classifiedRF = input.classify(classifierRF);
var classifiedNB = input.classify(classifierNB);

// Displaying data, define palette forthe classification 

var landcoverPalette= [
  '2BB2BF', //water 
  '145617', // forest, green
  'B90B06', // urban, built up
  '897B52', // barren, road
  'B7F08D' // prairie
];



// Accuracy assessment

var confusionMatrixCART = ee.ConfusionMatrix(testSet.classify(classifierCART)
  .errorMatrix({
    actual: 'class',
    predicted: 'classification'
}));

var confusionMatrixRF = ee.ConfusionMatrix(testSet.classify(classifierRF)
  .errorMatrix({
    actual: 'class',
    predicted: 'classification'
}));

var confusionMatrixSVM = ee.ConfusionMatrix(testSet.classify(classifierSVM)
  .errorMatrix({
    actual: 'class',
    predicted: 'classification'
}));

var confusionMatrixNB = ee.ConfusionMatrix(testSet.classify(classifierNB)
  .errorMatrix({
    actual: 'class',
    predicted: 'classification'
}));


print('CART ConfusionMatrix:', confusionMatrixCART);
print('CART Overall accuracy:', confusionMatrixCART.accuracy());

print('RF ConfusionMatrix:', confusionMatrixRF);
print('RF Overall accuracy:', confusionMatrixRF.accuracy());

print('SVM ConfusionMatrix:', confusionMatrixSVM);
print('SVM Overall accuracy:', confusionMatrixSVM.accuracy());

print('Naive Bayes ConfusionMatrix:', confusionMatrixNB);
print('Naive Bayes Overall accuracy:', confusionMatrixNB.accuracy());

// Validation par kappa statistics 

var kappaRF = confusionMatrixRF.kappa();
print('Validation Kappa',kappaRF);

// // Tuning Random forest parameters 

// var chart = ui.Chart(table, 'LineChart', 'RF Tuning');

// print('RF Tuning',chart);


//Map.addLayer(classifiedCART.clip(roi), {palette: landcoverPalette, min: 0, max: 4}, 'Classification CART');
//Map.addLayer(classifiedSVM.clip(roi), {palette: landcoverPalette, min: 0, max: 4}, 'Classification SVM');
Map.addLayer(classifiedRF.clip(roi), {palette: landcoverPalette, min: 0, max: 4}, 'Classification RF');

// Map.centerObject(roi,10);
// // Export data map to drive

// // Export.image.toDrive({
// //   image: classifiedCART,
// //   description: "Sentenel 2 CART",
// //   scale: 10,
// //   region: roi,
// //   maxPixels: 1e13,
// // });

// // Export.image.toDrive({
// //   image: classifiedSVM,
// //   description: "Sentenel 2 SVM",
// //   scale: 10,
// //   region: roi,
// //   maxPixels: 1e13,
// // });

// Export.image.toDrive({
//   image: classifiedRF,
//   description: "Sentenel 2 RF",
//   scale: 10,
//   region: roi,
//   maxPixels: 1e13,
// });


// // Export confusion matrix

// var exportAccuracy = ee.Feature(null, {matrix: confusionMatrixCART.array()})

// // Export the FeatureCollection.
// // Export.table.toDrive({
// //   collection: ee.FeatureCollection(exportAccuracy),
// //   description: 'exportAccuracy',
// //   fileFormat: 'CSV'
// // });

/////////// 4. Calculate the areas by land use type per year ///////////////////////////////// 

// // Develop a function to calculate the square km of each classification

var area_calculation = function(image,roi){

//   //// 2002 image

//   // Select water (0), green (1), urban (2), barren (3), prairie (4).
  var image_water = image.eq(0);
  var image_green = image.eq(1);
  var image_urban = image.eq(2);
  var image_barren = image.eq(3);
  var image_prairie = image.eq(4);
  
  // Calculate fallowed area by pixel (0 if pixel was not fallowed)

  var areaImageSqM = ee.Image.pixelArea().clip(roi);
  var areaImageSqKm = areaImageSqM.multiply(0.000001);
  
//   // Apply the sqkm to each classification

  var fallowed_water = image_water.multiply(areaImageSqKm);
  var fallowed_green = image_green.multiply(areaImageSqKm);
  var fallowed_urban = image_urban.multiply(areaImageSqKm);
  var fallowed_barren = image_barren.multiply(areaImageSqKm);
  var fallowed_prairie = image_prairie.multiply(areaImageSqKm);


//   // Calculate total fallowed area in square kilometers by category. 
//   // Urban
  var total_area_urban = fallowed_urban.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: roi,
	  scale: 30,
    maxPixels: 1e18
  });
  // Water
  var total_area_water = fallowed_water.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: roi,
	  scale: 30,
    maxPixels: 1e18
  });
  // Green
  var total_area_green = fallowed_green.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: roi,
	  scale: 30,
    maxPixels: 1e18
  });
  // barren
  var total_area_barren = fallowed_barren.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: roi,
	  scale: 30,
    maxPixels: 1e18
  });
  // prairie / grassland
  var total_area_prairie = fallowed_prairie.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: roi,
	  scale: 30,
    maxPixels: 1e18
  });

  
  // Create a list
  var total_area = ee.List([total_area_water, total_area_green, total_area_urban, total_area_barren, total_area_prairie])
  return total_area
}

// //  Results Area calculation

var TotalArea = area_calculation(classifiedRF.clip(roi), roi)
print('Total_area Random forest classification', TotalArea)

// //*******************************************************************************************//

// ////****************************************************************************//
// /////////// 5. Count the number of pixel per year ///////////////////////////////// 
// var pixel_count = function(image, AOI1){
  
//   // Clip the image
//   var image_clipped1 = image.clip(AOI1)

//   // Calculate total pixcel observation
//   var total_pixel1 = image_clipped1.reduceRegion({
//     reducer: ee.Reducer.count(),
//     geometry: AOI1,
//     scale: 30
//   });

//   var total_pixel = ee.List([total_pixel1])
//   return total_pixel
// }

// // Apply area calculation function to each buffer zone
// var TotalPixel_count = pixel_count(classified_SVM_train_2018, MUTP_road_rail)
// print('TotalPixel:', TotalPixel_count)

// // Apply area calculation function to each buffer zone

// /// 2km buffer zone calculation
// // Apply area calculation function to the adopted classifier, i.e. 2011 SVM, 2011 RF, 2018 SVM

// ////****************************************************************************//

// //////// Feature Data Visualization Parameters //
// // Create an empty image into which to paint the features, cast to byte.
// var empty = ee.Image().byte();

// // Paint all the polygon edges with the same number and width, display.
// var outline = empty.paint({
//   featureCollection: MUTP_road_rail,
//   color: 1,
//   width: 3
// });
// Map.addLayer(outline, {palette: 'FF0000'}, 'MUTP_road_rail_2kmBuff');

// //////////Export maps ////////////////////////

// Export.image.toDrive({
//   image: classified_SVM_train_2002.clip(MUTP_road_rail),
//   description: 'LULC_SVM_2002',
//   region: MUTP_road_rail.geometry().bounds(),
//   scale: 30,
//   maxPixels: 1e9})

// Export.image.toDrive({
//   image: classified_SVM_train_2011.clip(MUTP_road_rail),
//   description: 'LULC_SVM_2011',
//   region: MUTP_road_rail.geometry().bounds(),
//   scale: 30,
//   maxPixels: 1e9})
  
// Export.image.toDrive({
//   image: classified_SVM_train_2018.clip(MUTP_road_rail),
//   description: 'LULC_SVM_2018',
//   region: MUTP_road_rail.geometry().bounds(),
//   scale: 30,
//   maxPixels: 1e9})

// // ////////////////////////////////////////////////////////////////////////
// // // Export consufion matrix //
// // // var classifier_CART_validation_L8_array = classifier_CART_validation_L8.confusionMatrix();
// // // var exportAccuracy = ee.Feature(null, {matrix: classifier_CART_validation_L8_array.array()})

// // // // Export the FeatureCollection.
// // // Export.table.toDrive({
// // //   collection: ee.FeatureCollection(exportAccuracy),
// // //   description: 'exportAccuracy',
// // //   fileFormat: 'CSV'
// // // });


// // Export Total Area //
// // Create a function to convert a table style
// var change_table_format = function(total_area){
  
//   var TotalArea_table = ee.FeatureCollection(total_area
//                         .map(function(element){
//                         return ee.Feature(null,{prop:element})}))
//   return TotalArea_table
// }

// var TotalArea_2km_table = change_table_format(TotalArea_2km)
// var TotalPixel_count_table = change_table_format(TotalPixel_count)

// // Total land use size
// Export.table.toDrive({
//   collection: TotalArea_2km_table,
//   description:'TotalArea_2km',
//   fileFormat: 'CSV'})

// // Total Pixel
// Export.table.toDrive({
//   collection: TotalPixel_count_table,
//   description:'TotalPixel_count',
//   fileFormat: 'CSV'})
