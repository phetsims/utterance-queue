// Copyright 2021-2022, University of Colorado Boulder

/**
 * The ResponsePacket collects the categories of a single "response" into the following sections:
 * "Name Response" - A response that labels (names) some element to describe.
 * "Object Response" - A response directly describing the state of the named element.
 * "Context Response" - A response that describes surrounding context related to the named element or changes to it.
 * "Hint Response" - A response that gives a hint about what en element is for or how to interact with it.
 *
 * A response is most often tied to an element, or an object that is being described/voiced.
 *
 * Individual categories of responses can be enabled or disabled. The ResponsePacket keeps track of all these
 * responses. When it is time to alert the responses of this ResponsePacket, the ResponseCollector will assemble
 * a final string depending on which categories of responses are enabled.
 *
 * @author Jesse Greenberg
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import optionize, { Defaults } from '../../phet-core/js/optionize.js';
import ResponsePatternCollection from './ResponsePatternCollection.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

type ResponseCreator = () => ( string | null );
type Response = ResponseCreator | string | null;

type ResponsePacketOptions = {

  // spoken when name responses are enabled
  nameResponse?: Response;

  // spoken when object responses are enabled
  objectResponse?: Response;

  // spoken when context responses are enabled
  contextResponse?: Response;

  // spoken when interaction hints are enabled
  hintResponse?: Response;

  // Whether this response should ignore the Properties of responseCollector. If true, the nameResponse, objectResponse,
  // contextResponse, and interactionHint will all be spoken regardless of the values of the Properties of responseCollector
  ignoreProperties?: boolean;

  // Collection of string patterns to use with responseCollector.collectResponses, see ResponsePatternCollection for
  // more information.
  responsePatternCollection?: ResponsePatternCollection
}

const DEFAULT_OPTIONS: Defaults<ResponsePacketOptions, ResponsePacketOptions> = {
  nameResponse: null,
  objectResponse: null,
  contextResponse: null,
  hintResponse: null,
  ignoreProperties: false,

  // The collection of string patterns to use when assembling responses based on which
  // responses are provided and which responseCollector Properties are true. See ResponsePatternCollection
  // if you do not want to use the default.
  responsePatternCollection: ResponsePatternCollection.DEFAULT_RESPONSE_PATTERNS
};

class ResponsePacket {
  _nameResponse: Response;
  _objectResponse: Response;
  _contextResponse: Response;
  _hintResponse: Response;
  ignoreProperties: boolean;
  responsePatternCollection: ResponsePatternCollection
  static DEFAULT_OPTIONS = DEFAULT_OPTIONS

  constructor( providedOptions?: ResponsePacketOptions ) {
    const options = optionize<ResponsePacketOptions, ResponsePacketOptions>( {}, DEFAULT_OPTIONS, providedOptions );

    assert && assert( options.responsePatternCollection instanceof ResponsePatternCollection );

    // The response to be spoken for this packet when speaking names. This is usually
    // the same as the description accessible name, typically spoken on focus and on interaction, labelling what the
    // object is. Mutate as needed until time to alert.
    this._nameResponse = options.nameResponse;

    // The response to be spoken for this packet when speaking about object changes. This
    // is usually the state information, such as the current input value. Mutate as needed until time to alert.
    this._objectResponse = options.objectResponse;

    // The response to be spoken for this packet when speaking about context changes.
    // This is usually a response that describes the surrounding changes that have occurred after interacting
    // with the object. Mutate as needed until time to alert.
    this._contextResponse = options.contextResponse;

    // The response to be spoken for this packet when speaking hints. This is usually the response
    // that guides the user toward further interaction with this object if it is important to do so to use
    // the application. Mutate as needed until time to alert.
    this._hintResponse = options.hintResponse;

    // Controls whether or not the name, object, context, and hint responses are controlled
    // by responseCollector Properties. If true, all responses will be spoken when requested, regardless
    // of these Properties. This is often useful for surrounding UI components where it is important
    // that information be heard even when certain responses have been disabled. Mutate as needed until time to alert.
    this.ignoreProperties = options.ignoreProperties;

    // A collection of response patterns that are used when consolidating
    // each response with responseCollector. Controls the order of the Voicing responses and also punctuation
    // used when responses are assembled into final content for the UtteranceQueue. See ResponsePatternCollection for
    // more details. Mutate as needed until time to alert.
    this.responsePatternCollection = options.responsePatternCollection;
  }

  getNameResponse(): string | null {
    return ResponsePacket.getResponseText( this._nameResponse );
  }

  get nameResponse(): string | null { return this.getNameResponse(); }

  setNameResponse( nameResponse: Response ) {
    this._nameResponse = nameResponse;
  }

  set nameResponse( nameResponse: Response ) { this.setNameResponse( nameResponse ); }

  getObjectResponse(): string | null {
    return ResponsePacket.getResponseText( this._objectResponse );
  }

  get objectResponse(): string | null { return this.getObjectResponse(); }

  setObjectResponse( objectResponse: Response ) {
    this._objectResponse = objectResponse;
  }

  set objectResponse( objectResponse: Response ) { this.setObjectResponse( objectResponse ); }

  getContextResponse(): string | null {
    return ResponsePacket.getResponseText( this._contextResponse );
  }

  get contextResponse(): string | null { return this.getContextResponse(); }

  setContextResponse( contextResponse: Response ) {
    this._contextResponse = contextResponse;
  }

  set contextResponse( contextResponse: Response ) { this.setContextResponse( contextResponse ); }

  getHintResponse(): string | null {
    return ResponsePacket.getResponseText( this._hintResponse );
  }

  get hintResponse(): string | null { return this.getHintResponse(); }

  setHintResponse( hintResponse: Response ) {
    this._hintResponse = hintResponse;
  }

  set hintResponse( hintResponse: Response ) { this.setHintResponse( hintResponse ); }

  private static getResponseText( response: Response ): string | null {
    return typeof response === 'function' ? response() : response;
  }

  copy(): ResponsePacket {
    return new ResponsePacket( this.serialize() );
  }

  serialize(): Required<ResponsePacketOptions> {
    return {
      nameResponse: this.nameResponse,
      objectResponse: this.objectResponse,
      contextResponse: this.contextResponse,
      hintResponse: this.hintResponse,
      ignoreProperties: this.ignoreProperties,
      responsePatternCollection: this.responsePatternCollection
    };
  }
}

utteranceQueueNamespace.register( 'ResponsePacket', ResponsePacket );
export default ResponsePacket;
export type { ResponsePacketOptions, Response };