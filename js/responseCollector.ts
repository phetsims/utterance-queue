// Copyright 2021-2022, University of Colorado Boulder

/**
 * Manages output of responses for the Voicing feature. First, see SCENERY/Voicing.ts for a description of what that includes.
 * This singleton is responsible for controlling when responses of each category are spoken when speech is
 * requested for a Node composed with Voicing.
 *
 * @author Jesse Greenberg (PhET Interactive Simulations)
 */

import BooleanProperty from '../../axon/js/BooleanProperty.js';
import StringUtils from '../../phetcommon/js/util/StringUtils.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';
import ResponsePacket, { ResponsePacketOptions } from './ResponsePacket.js';
import ResponsePatternCollection from './ResponsePatternCollection.js';
import { combineOptions3 } from '../../phet-core/js/optionize.js';
import Property from '../../axon/js/Property.js';

class ResponseCollector {
  nameResponsesEnabledProperty: Property<boolean>;
  objectResponsesEnabledProperty: Property<boolean>;
  contextResponsesEnabledProperty: Property<boolean>;
  hintResponsesEnabledProperty: Property<boolean>;

  constructor() {

    // whether component names are read as input lands on various components
    this.nameResponsesEnabledProperty = new BooleanProperty( true );

    // whether "Object Responses" are read as interactive components change
    this.objectResponsesEnabledProperty = new BooleanProperty( false );

    // whether "Context Responses" are read as inputs receive interaction
    this.contextResponsesEnabledProperty = new BooleanProperty( false );

    // whether "Hints" are read to the user in response to certain input
    this.hintResponsesEnabledProperty = new BooleanProperty( false );
  }

  reset(): void {
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
   */
  collectResponses( providedOptions?: ResponsePacketOptions ): string {

    // see ResponsePacket for supported options
    const options = combineOptions3<ResponsePacketOptions>( {}, ResponsePacket.DEFAULT_OPTIONS, providedOptions );

    assert && assert( options.responsePatternCollection instanceof ResponsePatternCollection );

    const usesNames = !!( options.nameResponse && ( this.nameResponsesEnabledProperty.get() || options.ignoreProperties ) );
    const usesObjectChanges = !!( options.objectResponse && ( this.objectResponsesEnabledProperty.get() || options.ignoreProperties ) );
    const usesContextChanges = !!( options.contextResponse && ( this.contextResponsesEnabledProperty.get() || options.ignoreProperties ) );
    const usesInteractionHints = !!( options.hintResponse && ( this.hintResponsesEnabledProperty.get() || options.ignoreProperties ) );
    const responseKey = ResponsePatternCollection.createPatternKey( usesNames, usesObjectChanges, usesContextChanges, usesInteractionHints );

    let finalResponse = '';
    if ( responseKey ) {

      // graceful if the responseKey is empty, but if we formed some key, it should
      // be defined in responsePatternCollection
      const patternString = options.responsePatternCollection.getResponsePattern( responseKey );

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

utteranceQueueNamespace.register( 'responseCollector', responseCollector );
export default responseCollector;
