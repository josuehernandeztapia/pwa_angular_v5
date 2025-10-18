import { ComponentHarness } from '@angular/cdk/testing';

/**
 * Testing harness for ChartDirective that provides utilities to test Chart.js integration
 * in Angular components. This harness enables testing of chart rendering, accessibility,
 * and configuration validation in unit tests.
 */
export class ChartHarness extends ComponentHarness {
  /**
   * Selector for finding chart canvas elements with the appChart directive
   */
  static hostSelector = 'canvas[appChart]';

  /**
   * Checks if a chart has been rendered on the canvas.
   *
   * Chart.js automatically adds a `role="img"` attribute to the canvas element
   * when a chart is successfully rendered, providing accessibility compliance.
   *
   * @returns Promise resolving to true if chart is rendered, false otherwise
   */
  async isChartRendered(): Promise<boolean> {
    const host = await this.host();
    const role = await host.getAttribute('role');
    return role === 'img';
  }

  /**
   * Gets the canvas element hosting the chart
   * @returns The canvas test element
   */
  async getCanvas() {
    return this.host();
  }

  /**
   * Checks if the canvas has the correct aria attributes for accessibility
   * @returns Promise resolving to true if accessibility attributes are present
   */
  async hasAccessibilityAttributes(): Promise<boolean> {
    const host = await this.host();
    const role = await host.getAttribute('role');
    const ariaLabel = await host.getAttribute('aria-label');

    // Chart.js sets role="img" and may set aria-label
    return role === 'img' || !!ariaLabel;
  }

  /**
   * Gets the dimensions of the chart canvas
   * @returns Object containing width and height of the canvas
   */
  async getCanvasDimensions(): Promise<{ width: number; height: number }> {
    const host = await this.host();
    const width = await host.getProperty('width') as number;
    const height = await host.getProperty('height') as number;

    return { width, height };
  }
}