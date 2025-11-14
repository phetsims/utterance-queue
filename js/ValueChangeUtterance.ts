// Copyright 2019-2025, University of Colorado Boulder

/**
 * An Utterance generally used to announce information after interacting with a component
 * that provides an object response related to a value.
 *
 * Often, screen readers announce built-in object responses (such as aria-valuetext) outside
 * our response system. This limits our control over the sequencing of context responses.
 * We have observed that some screen readers (like VoiceOver and JAWS) may not announce responses queued
 * immediately after an object response unless a delay is introduced.
 *
 * Adding a delay to this Utterance ensures the screen reader announces additional information
 * after the object response. This is especially important for VoiceOver and JAWS. See:
 * https://github.com/phetsims/scenery-phet/issues/491
 * https://github.com/phetsims/john-travoltage/issues/315
 *
 * NOTE: If using AccessibleValueHandler for slider-like interactions, consider
 * AccessibleValueHandler.createContextResponseAlert() instead.
 *
 * @author Jesse Greenberg
 */

import optionize, { EmptySelfOptions } from '../../phet-core/js/optionize.js';
import Utterance, { UtteranceOptions } from './Utterance.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

export type ValueChangeUtteranceOptions = UtteranceOptions;

class ValueChangeUtterance extends Utterance {

  public constructor( providedOptions?: ValueChangeUtteranceOptions ) {

    const options = optionize<ValueChangeUtteranceOptions, EmptySelfOptions, UtteranceOptions>()( {

      // {number} - in ms, prevents VoiceOver from reading changes too frequently or interrupting the alert to read
      // aria-valuetext changes under typical user settings
      alertStableDelay: 1000
    }, providedOptions );

    super( options );
  }
}

utteranceQueueNamespace.register( 'ValueChangeUtterance', ValueChangeUtterance );
export default ValueChangeUtterance;