// Copyright 2021, University of Colorado Boulder

/**
 * Manages output of responses for the Voicing feature. First, see SCENERY/Voicing.js for a description of what that includes.
 * This singleton is responsible for controlling when responses of each category are spoken when speech is
 * requested for a Node composed with Voicing.
 *
 * TODO: create a reset function https://github.com/phetsims/utterance-queue/issues/31
 *
 * @author Jesse Greenberg (PhET Interactive Simulations)
 */

import BooleanProperty from '../../axon/js/BooleanProperty.js';
import merge from '../../phet-core/js/merge.js';
import StringUtils from '../../phetcommon/js/util/StringUtils.js';
import scenery from '../../scenery/js/scenery.js';
import ResponsePacket from './ResponsePacket.js';
import ResponsePatterns from './ResponsePatterns.js';

class ResponseCollector {
  constructor() {

    // @public {BooleanProperty} - whether or not component names are read as input lands on various components
    this.nameResponsesEnabledProperty = new BooleanProperty( true );

    // @public {BooleanProperty} - whether or not "Object Responses" are read as interactive components change
    this.objectResponsesEnabledProperty = new BooleanProperty( false );

    // @public {BooleanProperty} - whether or not "Context Responses" are read as inputs receive interaction
    this.contextResponsesEnabledProperty = new BooleanProperty( false );

    // @public {BooleanProperty} - whether or not "Hints" are read to the user in response to certain input
    this.hintResponsesEnabledProperty = new BooleanProperty( false );
  }

  /**
   * @public
   */
  reset() {
    this.nameResponsesEnabledProperty.reset();
    this.objectResponsesEnabledProperty.reset();
    this.contextResponsesEnabledProperty.reset();
    this.hintResponsesEnabledProperty.reset();
  }

  /**
   * Prepares final output with an object response, a context response, and a hint. Each response
   * will only be added to the final string if that response type is included by the user. Rather than using
   * unique utterances, we use string interpolation so that the highlight around the abject being spoken
   * about stays lit for the entire combination of responses.
   * @public
   *
   * @param {Object} [options]
   * @returns {string}
   */
  collectResponses( options ) {

    // see ResponsePacket for supported options
    options = merge( {}, ResponsePacket.DEFAULT_OPTIONS, options );

    assert && assert( options.responsePatterns instanceof ResponsePatterns );

    const usesNames = options.nameResponse && ( this.nameResponsesEnabledProperty.get() || options.ignoreProperties );
    const usesObjectChanges = options.objectResponse && ( this.objectResponsesEnabledProperty.get() || options.ignoreProperties );
    const usesContextChanges = options.contextResponse && ( this.contextResponsesEnabledProperty.get() || options.ignoreProperties );
    const usesInteractionHints = options.hintResponse && ( this.hintResponsesEnabledProperty.get() || options.ignoreProperties );
    const responseKey = ResponsePatterns.createPatternKey( usesNames, usesObjectChanges, usesContextChanges, usesInteractionHints );

    let finalResponse = '';
    if ( responseKey ) {

      // graceful if the responseKey is empty, but if we formed some key, it should
      // be defined in responsePatterns
      const patternString = options.responsePatterns[ responseKey ];
      assert && assert( patternString, `no pattern string found for key ${responseKey}` );

      finalResponse = StringUtils.fillIn( patternString, {
        NAME: options.nameResponse,
        OBJECT: options.objectResponse,
        CONTEXT: options.contextResponse,
        HINT: options.hintResponse
      } );
    }

    return finalResponse;
  }
}

const responseCollector = new ResponseCollector();

scenery.register( 'responseCollector', responseCollector );
export default responseCollector;
