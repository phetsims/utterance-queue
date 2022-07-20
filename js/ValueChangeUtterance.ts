// Copyright 2019-2022, University of Colorado Boulder

/**
 * An utterance that should generally be used for announcing a change in value after interacting with a slider
 * or number type input. Often, changes to a value are announced with aria-valuetext, but additional information about
 * the change is conveyed by a supplemental Utterance. The delay ensures that VoiceOver and JAWS will announce the
 * alert after reading the aria-valuetext in full. See https://github.com/phetsims/scenery-phet/issues/491 and
 * https://github.com/phetsims/john-travoltage/issues/315 for testing notes.
 *
 * @author Jesse Greenberg
 */

import deprecationWarning from '../../phet-core/js/deprecationWarning.js';
import optionize, { EmptySelfOptions } from '../../phet-core/js/optionize.js';
import Utterance, { UtteranceOptions } from './Utterance.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

export type ValueChangeUtteranceOptions = UtteranceOptions;

class ValueChangeUtterance extends Utterance {

  public constructor( providedOptions?: ValueChangeUtteranceOptions ) {
    deprecationWarning( 'Please use AccessibleValueHander.a11yCreateContextResponseAlert(), see https://github.com/phetsims/sun/issues/685' );

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