// Copyright 2024, University of Colorado Boulder

/**
 * ESLint configuration for utterance-queue.
 *
 * @author Sam Reid (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import phetLibraryEslintConfig from '../perennial-alias/js/eslint/config/phet-library.eslint.config.mjs';

export default [
  ...phetLibraryEslintConfig,
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