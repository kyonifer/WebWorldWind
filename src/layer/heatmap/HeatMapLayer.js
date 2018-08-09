/*
 * Copyright 2003-2006, 2009, 2017, United States Government, as represented by the Administrator of the
 * National Aeronautics and Space Administration. All rights reserved.
 *
 * The NASAWorldWind/WebWorldWind platform is licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
define([
    '../../error/ArgumentError',
    './HeatMapColoredTile',
    './HeatMapIntervalType',
    './HeatMapTile',
    '../../util/ImageSource',
    '../../geom/Location',
    '../../util/Logger',
    '../../geom/MeasuredLocation',
    '../TiledImageLayer',
    '../../geom/Sector',
    '../../util/WWUtil'
], function (ArgumentError,
             HeatMapColoredTile,
             HeatMapIntervalType,
             HeatMapTile,
             ImageSource,
             Location,
             Logger,
             MeasuredLocation,
             TiledImageLayer,
             Sector,
             WWUtil) {
    "use strict";

    /**
     * Constructs a HeatMap Layer.
     *
     * The default implementation uses gradient circles to display measured locations. The measure of the locations
     * define the colors of the gradient.
     *
     * @alias HeatMapLayer
     * @constructor
     * @augments TiledImageLayer
     * @classdesc A HeatMap layer for visualising an array of measured locations.
     * @param {String} displayName This layer's display name.
     * @param {MeasuredLocation[]} measuredLocations An array of locations with measures to visualise.
     */
    var HeatMapLayer = function (displayName, measuredLocations) {
        this.tileWidth = 256;
        this.tileHeight = 256;

        TiledImageLayer.call(this, new Sector(-90, 90, -180, 180), new Location(45, 45), 18, 'image/png', 'HeatMap' + WWUtil.guid(), this.tileWidth, this.tileHeight);

        this.displayName = displayName;

        var data = {};
        for (var lat = -90; lat <= 90; lat++) {
            data[lat] = {};
            for (var lon = -180; lon <= 180; lon++) {
                data[lat][lon] = [];
            }
        }

        var latitude, longitude;
        var max = Number.MIN_VALUE;
        measuredLocations.forEach(function (measured) {
            latitude = Math.floor(measured.latitude);
            longitude = Math.floor(measured.longitude);
            data[latitude][longitude].push(measured);
            if(measured.measure > max) {
                max = measured.measure;
            }
        });

        this._data = data;
        this._measuredLocations = measuredLocations;
        this._intervalType = HeatMapIntervalType.CONTINUOUS;
        this._scale = ['blue', 'cyan', 'lime', 'yellow', 'red'];
        this._radius = 12.5;
        this._blur = 5;
        this._incrementPerIntensity = 1 / max;

        this.setGradient(measuredLocations);
    };

    HeatMapLayer.prototype = Object.create(TiledImageLayer.prototype);

    Object.defineProperties(HeatMapLayer.prototype, {
        /**
         * Type of interval to apply between the minimum and maximum values in the data. Default value is CONTINUOUS.
         * @memberof HeatMapLayer.prototype
         * @type {HeatMapIntervalType}
         */
        intervalType: {
            get: function () {
                return this._intervalType;
            },
            set: function (intervalType) {
                this._intervalType = intervalType;
                this.setGradient();
            }
        },

        /**
         * Array of colors representing the scale used when generating the gradients.
         * The default value is ['blue', 'cyan', 'lime', 'yellow', 'red'].
         * @memberof HeatMapLayer.prototype
         * @type {String[]}
         */
        scale: {
            get: function () {
                return this._scale;
            },
            set: function (scale) {
                this._scale = scale;
                this.setGradient();
            }
        },

        /**
         * Gradient of colours used to draw the points and derived from the scale and the data.
         * @memberOf HeatMapLayer.prototype
         * @type {String[]}
         */
        gradient: {
            get: function () {
                return this._gradient;
            },
            set: function (gradient) {
                this._gradient = gradient;
                // TODO The gradient depends on the scale. Should it be readonly? Should the scale be cleared when the
                // gradient is manually set if it even makes sense?
            }
        },

        /**
         * Radius of a point in pixels. The default value is 12.5.
         * @memberof HeatMapLayer.prototype
         * @type {Number}
         */
        radius: {
            get: function () {
                return this._radius;
            },
            set: function (radius) {
                this._radius = radius;
            }
        },

        /**
         * Blur distance around a point in pixels. The default value is 5.
         * @memberof HeatMapLayer.prototype
         * @type {Number}
         */
        blur: {
            get: function () {
                return this._blur;
            },
            set: function (blur) {
                this._blur = blur;
            }
        }
    });

    /**
     * Returns the relevant points for the visualisation for current sector. At the moment it uses QuadTree to retrieve
     * the information.
     * @private
     * @param data
     * @param sector
     * @returns {Object[]}
     */
    HeatMapLayer.prototype.filterGeographically = function (data, sector) {
        var minLatitude = Math.floor(sector.minLatitude);
        var maxLatitude = Math.floor(sector.maxLatitude);
        var minLongitude = Math.floor(sector.minLongitude);
        var maxLongitude = Math.floor(sector.maxLongitude);

        var extraLongitudeBefore = 0, extraLongitudeAfter = 0;

        if (minLatitude <= -90) {
            minLatitude = -90;
        }
        if (maxLatitude >= 90) {
            maxLatitude = 90;
        }

        if (minLongitude <= -180) {
            extraLongitudeBefore = Math.abs(minLongitude - (-180));
            minLongitude = -180;
        }
        if (maxLongitude >= 180) {
            extraLongitudeAfter = Math.abs(maxLongitude - 180);
            maxLongitude = 180;
        }

        var result = [];
        var lat, lon;
        this.gatherGeographical(data, result, sector, minLatitude, maxLatitude, minLongitude, maxLongitude);

        if (extraLongitudeBefore !== 0) {
            var beforeSector = new Sector(minLatitude, maxLatitude, 180 - extraLongitudeBefore, 180);
            for (lat = minLatitude; lat <= maxLatitude; lat++) {
                for (lon = 180 - extraLongitudeBefore; lon <= 180; lon++) {
                    data[lat][lon].forEach(function (element) {
                        if (beforeSector.containsLocation(element.latitude, element.longitude)) {
                            result.push(new MeasuredLocation(element.latitude, -360 + element.longitude, element.measure));
                        }
                    });
                }
            }
        }
        if (extraLongitudeAfter !== 0) {
            var afterSector = new Sector(minLatitude, maxLatitude, -180, -180 + extraLongitudeAfter);

            for (lat = minLatitude; lat <= maxLatitude; lat++) {
                for (lon = -180; lon <= -180 + extraLongitudeAfter; lon++) {
                    data[lat][lon].forEach(function (element) {
                        if (afterSector.containsLocation(element.latitude, element.longitude)) {
                            result.push(new MeasuredLocation(element.latitude, 360 + element.longitude, element.measure));
                        }
                    });
                }
            }
        }

        return result;
    };

    /**
     * Internal method to gather the geographical data for given sector and boundingBox.
     * @private
     * @param data
     * @param result
     * @param sector
     * @param minLatitude
     * @param maxLatitude
     * @param minLongitude
     * @param maxLongitude
     */
    HeatMapLayer.prototype.gatherGeographical = function (data, result, sector, minLatitude, maxLatitude, minLongitude, maxLongitude) {
        var lat, lon;
        for (lat = minLatitude; lat <= maxLatitude; lat++) {
            for (lon = minLongitude; lon <= maxLongitude; lon++) {
                data[lat][lon].forEach(function (element) {
                    if (sector.containsLocation(element.latitude, element.longitude)) {
                        result.push(element);
                    }
                });
            }
        }
    };

    /**
     * Sets gradient based on the Scale and IntervalType.
     */
    HeatMapLayer.prototype.setGradient = function () {
        var intervalType = this.intervalType;
        var scale = this.scale;

        var gradient = {};
        if (intervalType === HeatMapIntervalType.CONTINUOUS) {
            scale.forEach(function (color, index) {
                gradient[index / scale.length] = color;
            });
        } else if (intervalType === HeatMapIntervalType.QUANTILES) {
            var data = this._measuredLocations;
            // Equal amount of pieces in each group.
            data.sort(function (item1, item2) {
                if (item1.measure < item2.measure) {
                    return -1;
                } else if (item1.measure > item2.measure) {
                    return 1;
                } else {
                    return 0;
                }
            });
            var max = data[data.length - 1].measure;
            if (data.length >= scale.length) {
                scale.forEach(function (color, index) {
                    // What is the fraction of the colors
                    var fractionDecidingTheScale = index / scale.length; // Kolik je na nte pozice z maxima.
                    var pointInScale = data[Math.floor(fractionDecidingTheScale * data.length)].measure / max;
                    if(index === 0) {
                        gradient[0] = color;
                    } else {
                        gradient[pointInScale] = color;
                    }
                });
            } else {
                scale.forEach(function (color, index) {
                    gradient[index / scale.length] = color;
                });
            }
        }
        this.gradient = gradient;
    };

    /**
     * @inheritDoc
     */
    HeatMapLayer.prototype.retrieveTileImage = function (dc, tile, suppressRedraw) {
        if (this.currentRetrievals.indexOf(tile.imagePath) < 0) {
            if (this.absentResourceList.isResourceAbsent(tile.imagePath)) {
                return;
            }

            var imagePath = tile.imagePath,
                cache = dc.gpuResourceCache,
                layer = this,
                radius = this.radius;

            var extended = this.calculateExtendedSector(tile.sector, 2 * (radius / this.tileWidth), 2 * (radius / this.tileHeight));
            var extendedWidth = Math.ceil(extended.extensionFactorWidth * this.tileWidth);
            var extendedHeight = Math.ceil(extended.extensionFactorHeight * this.tileHeight);

            var data = this.filterGeographically(this._data, extended.sector);

            var canvas = this.createHeatMapTile(data, {
                sector: extended.sector,

                width: this.tileWidth + 2 * extendedWidth,
                height: this.tileHeight + 2 * extendedHeight,
                radius: radius,
                blur: this.blur,

                intensityGradient: this.gradient,
                incrementPerIntensity: this._incrementPerIntensity,

                extendedWidth: extendedWidth,
                extendedHeight: extendedHeight
            }).canvas();

            var result = document.createElement('canvas');
            result.height = this.tileHeight;
            result.width = this.tileWidth;
            result.getContext('2d').putImageData(canvas.getContext('2d').getImageData(
                extendedWidth, extendedHeight, this.tileWidth, this.tileHeight), 0, 0
            );

            var texture = layer.createTexture(dc, tile, result);
            layer.removeFromCurrentRetrievals(imagePath);

            if (texture) {
                cache.putResource(imagePath, texture, texture.size);

                layer.currentTilesInvalid = true;
                layer.absentResourceList.unmarkResourceAbsent(imagePath);

                if (!suppressRedraw) {
                    // Send an event to request a redraw.
                    var e = document.createEvent('Event');
                    e.initEvent(WorldWind.REDRAW_EVENT_TYPE, true, true);
                    window.dispatchEvent(e);
                }
            }
        }
    };


    /**
     * Calculates the new sector for which the data will be filtered and which will be drawn on the tile.
     * The standard version just applies extension factor to the difference between minimum and maximum.
     * @protected
     * @param sector {Sector} Sector to use as basis for the extension.
     * @param extensionFactorWidth {Number} The factor to be applied on the width to get sector representing the right geographical area.
     * @param extensionFactorHeight {Number} The factor to be applied on the height to get sector representing the right geographical area.
     * @return {Object} .sector New extended sector.
     *                  .extensionFactorHeight The factor by which the area is changed on the latitude.
     *                  .extensionFactorWidth The factor by which the area is changed on the longitude.
     */
    HeatMapLayer.prototype.calculateExtendedSector = function (sector, extensionFactorWidth, extensionFactorHeight) {
        var latitudeChange = (sector.maxLatitude - sector.minLatitude) * extensionFactorHeight;
        var longitudeChange = (sector.maxLongitude - sector.minLongitude) * extensionFactorWidth;
        return {
            sector: new Sector(
                sector.minLatitude - latitudeChange,
                sector.maxLatitude + latitudeChange,
                sector.minLongitude - longitudeChange,
                sector.maxLongitude + longitudeChange
            ),
            extensionFactorHeight: extensionFactorHeight,
            extensionFactorWidth: extensionFactorWidth
        };
    };

    /**
     * Overwrite this method if you want to use a custom implementation of tile used for displaying the data.
     * @protected
     * @param data {Object[]} Array of information constituting points in the map.
     * @param options {Object}
     * @param options.sector {Sector} Sector with the geographical information for tile representation.
     * @param options.width {Number} Width of the Canvas to be created in pixels.
     * @param options.height {Number} Height of the Canvas to be created in pixels.
     * @param options.radius {Number} Radius of the data point in pixels.
     * @param options.blur {Number} Blur of the HeatMap element in the pixels.
     * @param options.incrementPerIntensity {Number}
     * @return {HeatMapTile} Implementation of the HeatMapTile used for this instance of the layer.
     */
    HeatMapLayer.prototype.createHeatMapTile = function (data, options) {
        return new HeatMapColoredTile(data, options);
    };

    return HeatMapLayer;
});