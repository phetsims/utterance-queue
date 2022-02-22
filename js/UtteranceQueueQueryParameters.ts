// Copyright 2022, University of Colorado Boulder

/**
 * @author Jesse Greenberg (PhET Interactive Simulations)
 */

import utteranceQueueNamespace from './utteranceQueueNamespace.js';

const UtteranceQueueQueryParameters = QueryStringMachine.getAll( {

  /**
   * When true, use SpeechSynthesisParentPolyfill to assign an implementation of SpeechSynthesis
   * to the window so that it can be used in platforms where it otherwise would not be available.
   * Assumes that an implementation of SpeechSynthesis is available from a parent iframe window.
   * See SpeechSynthesisParentPolyfill for more information.
   *
   * See https://github.com/phetsims/fenster/issues/3
   */
  speechSynthesisFromParent: {
    type: 'flag'
  }
} );

utteranceQueueNamespace.register( 'UtteranceQueueQueryParameters', UtteranceQueueQueryParameters );
export default UtteranceQueueQueryParameters;
