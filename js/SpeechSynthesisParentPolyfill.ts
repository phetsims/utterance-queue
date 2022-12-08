// Copyright 2022, University of Colorado Boulder

/**
 * A polyfill for SpeechSynthesis that tries to pull a working implementation from a parent window. Assumes that
 * this code is running in an iframe hosted by a parent window and that the parent has a working implementation
 * of SpeechSynthesis. In particular, this is used in fenster as a way to get SpeechSynthesis in an Android WebView
 * where SpeechSynthesis is not currently supported. See fenster for more information about an example use case.
 *
 * @author Jesse Greenberg (PhET Interactive Simulations)
 */

import utteranceQueueNamespace from './utteranceQueueNamespace.js';

const SpeechSynthesisParentPolyfill = {

  /**
   * Initialize the polyfill, setting objects related to SpeechSynthesis on the window. The implementation of
   * SpeechSynthesisPolyfill assumes that the simulation is running in a child iframe under a parent window
   * that implements SpeechSynthesis. So we grab the implementation from the parent and set it to this window.
   */
  initialize(): void {
    if ( window.speechSynthesis || window.SpeechSynthesis || window.SpeechSynthesisUtterance ) {
      throw new Error( 'SpeechSynthesis is supported here, the polyfill should not overwrite it' );
    }

    assert && assert( window.parent, 'This polyfill requires a parent frame implementation of SpeechSynthesis.' );

    // @ts-expect-error - Very hacky, this prototype solution is not getting work anymore. No need for better solution.
    window.SpeechSynthesis = window.parent.SpeechSynthesis;

    // @ts-expect-error - Very hacky, this prototype solution is not getting work anymore. No need for better solution.
    window.speechSynthesis = new window.parent.SpeechSynthesis();

    // @ts-expect-error - Very hacky, this prototype solution is not getting work anymore. No need for better solution.
    window.SpeechSynthesisUtterance = window.parent.SpeechSynthesisUtterance;
  }
};

utteranceQueueNamespace.register( 'SpeechSynthesisParentPolyfill', SpeechSynthesisParentPolyfill );
export default SpeechSynthesisParentPolyfill;
