// Copyright 2021, University of Colorado Boulder

/**

 * @author Jesse Greenberg
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import merge from '../../phet-core/js/merge.js';
import ResponsePatternCollection from './ResponsePatternCollection.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

const DEFAULT_OPTIONS = {

  // {string|null} - spoken when name responses are enabled
  nameResponse: null,

  // {string|null} - spoken when object responses are enabled
  objectResponse: null,

  // {string|null} - spoken when context responses are enabled
  contextResponse: null,

  // {string|null} - spoken when interaction hints are enabled
  hintResponse: null,

  // {boolean} - if true, the nameResponse, objectResponse, contextResponse, and interactionHint will all be spoken
  // regardless of the values of the Properties of responseCollector
  ignoreProperties: false,

  // {ResponsePatternCollection} - The collection of string patterns to use when assembling responses based on which
  // responses are provided and which responseCollector Properties are true. See ResponsePatternCollection
  // if you do not want to use the default.
  responsePatternCollection: ResponsePatternCollection.DEFAULT_RESPONSE_PATTERNS
};

class ResponsePacket {

  /**
   * @param {Object} [options]
   */
  constructor( options ) {
    options = merge( {}, DEFAULT_OPTIONS, options );

    assert && assert( options.responsePatternCollection instanceof ResponsePatternCollection );

    // @public - mutate as needed until time to alert.
    this.nameResponse = options.nameResponse;
    this.objectResponse = options.objectResponse;
    this.contextResponse = options.contextResponse;
    this.hintResponse = options.hintResponse;
    this.ignoreProperties = options.ignoreProperties;
    this.responsePatternCollection = options.responsePatternCollection;
  }

  /**
   * @public
   * @returns {ResponsePacket}
   */
  copy() {
    return new ResponsePacket( _.extend( {}, this ) );
  }
}

// @static @public
ResponsePacket.DEFAULT_OPTIONS = DEFAULT_OPTIONS;

utteranceQueueNamespace.register( 'ResponsePacket', ResponsePacket );
export default ResponsePacket;