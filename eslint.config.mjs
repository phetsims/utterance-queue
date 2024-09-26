// Copyright 2024, University of Colorado Boulder

/**
 * ESlint configuration for utterance-queue.
 *
 * @author Sam Reid (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import parent from '../chipper/eslint/phet-library.eslint.config.mjs';

export default [
  ...parent,
  {
    languageOptions: {
      globals: {
        SpeechSynthesis: 'readonly',
        SpeechSynthesisVoice: 'readonly',
        SpeechSynthesisUtterance: 'readonly'
      }
    }
  }
];