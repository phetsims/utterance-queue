// Copyright 2023-2024, University of Colorado Boulder

/**
 * A set of utility functions that are useful for all utterance-queue tests.
 *
 * @author Jesse Greenberg (PhET Interactive Simulations)
 */

import stepTimer from '../../axon/js/stepTimer.js';

// Arbitrary value to let the
const TIMING_BUFFER = 300;

class UtteranceQueueTestUtils {

  /**
   * Helper es6 promise timeout function.
   * @param ms
   */
  public static timeout( ms: number ): Promise<unknown> {
    return new Promise( resolve => setTimeout( resolve, ms ) ); // eslint-disable-line phet/bad-sim-text
  }

  /**
   * Workarounds that need to be done before each test to let the Utterance Queue finish an timed operation before
   * the next test. This is not needed when running manually, but I believe will fix problems when running on
   * CT/Puppeteer where resource availablility, running headless, or other factors may cause differences.
   */
  public static async beforeEachTimingWorkarounds(): Promise<void> {

    // Give plenty of time for the Announcer to be ready to speak again. For some reason this needs to be a really
    // large number to get tests to pass consistently. I am starting to have a hunch that QUnit tries to run
    // async tests in parallel...
    await UtteranceQueueTestUtils.timeout( TIMING_BUFFER * 3 );

    // From debugging, I am not convinced that setInterval is called consistently while we wait for timeouts. Stepping
    // the timer here improves consistency and gets certain tests passing. Specifically, I want to make sure that
    // timing variables related to waiting for voicingManager to be readyToAnnounce have enough time to reset
    stepTimer.emit( TIMING_BUFFER * 3 );
  }
}

// This is a test utility file and does not need to be in the namespace.
// eslint-disable-next-line phet/default-export-class-should-register-namespace
export default UtteranceQueueTestUtils;