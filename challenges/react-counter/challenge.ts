// React Counter Component Challenge
export const counterChallenge = {
    name: 'React Counter Component',
    description: `Build a Counter component using React with the following features:

Requirements:
- Display the current count value (start from 0)
- Increment button: Clicking increases count by 1
- Decrement button: Clicking decreases count by 1
- Reset button: Clicking resets count to 0
- The count should never go below 0 (decrement should stop at 0)

Component Structure:
- Count display should have data-testid="count-display"
- Increment button should have data-testid="increment-btn"
- Decrement button should have data-testid="decrement-btn"
- Reset button should have data-testid="reset-btn"

Export the component as default export.`,

    starterFiles: {
        'src/Counter.jsx': `import React, { useState } from 'react';

// TODO: Implement the Counter component
// Requirements:
// - Display count (starting from 0)
// - Increment, Decrement, Reset buttons
// - Count should never go below 0

function Counter() {
    // Your code here...
    
    return (
        <div>
            {/* Implement the counter UI */}
        </div>
    );
}

export default Counter;
`,
        'src/index.jsx': `import React from 'react';
import { createRoot } from 'react-dom/client';
import Counter from './Counter';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<Counter />);
`,
    },

    // Public Tests - Visible to candidates
    publicTests: `import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Counter from '../src/Counter';

describe('Counter Component - Public Tests', () => {
    test('renders with initial count of 0', () => {
        render(<Counter />);
        const countDisplay = screen.getByTestId('count-display');
        expect(countDisplay).toHaveTextContent('0');
    });

    test('increment button increases count by 1', () => {
        render(<Counter />);
        const countDisplay = screen.getByTestId('count-display');
        const incrementBtn = screen.getByTestId('increment-btn');
        
        fireEvent.click(incrementBtn);
        expect(countDisplay).toHaveTextContent('1');
    });

    test('decrement button decreases count by 1', () => {
        render(<Counter />);
        const incrementBtn = screen.getByTestId('increment-btn');
        const decrementBtn = screen.getByTestId('decrement-btn');
        const countDisplay = screen.getByTestId('count-display');
        
        // First increment to 2
        fireEvent.click(incrementBtn);
        fireEvent.click(incrementBtn);
        expect(countDisplay).toHaveTextContent('2');
        
        // Then decrement
        fireEvent.click(decrementBtn);
        expect(countDisplay).toHaveTextContent('1');
    });

    test('reset button resets count to 0', () => {
        render(<Counter />);
        const incrementBtn = screen.getByTestId('increment-btn');
        const resetBtn = screen.getByTestId('reset-btn');
        const countDisplay = screen.getByTestId('count-display');
        
        // Increment a few times
        fireEvent.click(incrementBtn);
        fireEvent.click(incrementBtn);
        fireEvent.click(incrementBtn);
        expect(countDisplay).toHaveTextContent('3');
        
        // Reset
        fireEvent.click(resetBtn);
        expect(countDisplay).toHaveTextContent('0');
    });
});
`,

    // Hidden Tests - For final evaluation
    hiddenTests: `import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Counter from '../src/Counter';

describe('Counter Component - Hidden Tests', () => {
    // ===== BOUNDARY TEST: Count never goes below 0 =====
    test('count never goes below 0', () => {
        render(<Counter />);
        const decrementBtn = screen.getByTestId('decrement-btn');
        const countDisplay = screen.getByTestId('count-display');
        
        // Click decrement multiple times when already at 0
        fireEvent.click(decrementBtn);
        fireEvent.click(decrementBtn);
        fireEvent.click(decrementBtn);
        
        expect(countDisplay).toHaveTextContent('0');
    });

    // ===== MULTIPLE OPERATIONS =====
    test('multiple increments work correctly', () => {
        render(<Counter />);
        const incrementBtn = screen.getByTestId('increment-btn');
        const countDisplay = screen.getByTestId('count-display');
        
        for (let i = 0; i < 10; i++) {
            fireEvent.click(incrementBtn);
        }
        
        expect(countDisplay).toHaveTextContent('10');
    });

    test('increment then decrement sequence', () => {
        render(<Counter />);
        const incrementBtn = screen.getByTestId('increment-btn');
        const decrementBtn = screen.getByTestId('decrement-btn');
        const countDisplay = screen.getByTestId('count-display');
        
        // +5
        for (let i = 0; i < 5; i++) {
            fireEvent.click(incrementBtn);
        }
        expect(countDisplay).toHaveTextContent('5');
        
        // -3
        for (let i = 0; i < 3; i++) {
            fireEvent.click(decrementBtn);
        }
        expect(countDisplay).toHaveTextContent('2');
    });

    // ===== RESET BEHAVIOR =====
    test('reset works after many operations', () => {
        render(<Counter />);
        const incrementBtn = screen.getByTestId('increment-btn');
        const decrementBtn = screen.getByTestId('decrement-btn');
        const resetBtn = screen.getByTestId('reset-btn');
        const countDisplay = screen.getByTestId('count-display');
        
        // Do some operations
        for (let i = 0; i < 7; i++) {
            fireEvent.click(incrementBtn);
        }
        fireEvent.click(decrementBtn);
        fireEvent.click(decrementBtn);
        
        expect(countDisplay).toHaveTextContent('5');
        
        // Reset
        fireEvent.click(resetBtn);
        expect(countDisplay).toHaveTextContent('0');
        
        // Should be able to increment again after reset
        fireEvent.click(incrementBtn);
        expect(countDisplay).toHaveTextContent('1');
    });

    test('multiple resets work correctly', () => {
        render(<Counter />);
        const incrementBtn = screen.getByTestId('increment-btn');
        const resetBtn = screen.getByTestId('reset-btn');
        const countDisplay = screen.getByTestId('count-display');
        
        fireEvent.click(incrementBtn);
        fireEvent.click(incrementBtn);
        fireEvent.click(resetBtn);
        expect(countDisplay).toHaveTextContent('0');
        
        fireEvent.click(incrementBtn);
        fireEvent.click(resetBtn);
        expect(countDisplay).toHaveTextContent('0');
    });

    // ===== EDGE CASE: Decrement at boundary =====
    test('decrement at 1 goes to 0, not negative', () => {
        render(<Counter />);
        const incrementBtn = screen.getByTestId('increment-btn');
        const decrementBtn = screen.getByTestId('decrement-btn');
        const countDisplay = screen.getByTestId('count-display');
        
        fireEvent.click(incrementBtn); // 1
        expect(countDisplay).toHaveTextContent('1');
        
        fireEvent.click(decrementBtn); // 0
        expect(countDisplay).toHaveTextContent('0');
        
        fireEvent.click(decrementBtn); // still 0
        expect(countDisplay).toHaveTextContent('0');
    });

    // ===== ISOLATION: Each instance is independent =====
    test('component renders all required buttons', () => {
        render(<Counter />);
        
        expect(screen.getByTestId('increment-btn')).toBeInTheDocument();
        expect(screen.getByTestId('decrement-btn')).toBeInTheDocument();
        expect(screen.getByTestId('reset-btn')).toBeInTheDocument();
        expect(screen.getByTestId('count-display')).toBeInTheDocument();
    });

    // ===== RANDOM SEQUENCE TEST =====
    test('random operation sequence produces correct result', () => {
        render(<Counter />);
        const incrementBtn = screen.getByTestId('increment-btn');
        const decrementBtn = screen.getByTestId('decrement-btn');
        const countDisplay = screen.getByTestId('count-display');
        
        let expected = 0;
        
        // +3
        for (let i = 0; i < 3; i++) {
            fireEvent.click(incrementBtn);
            expected++;
        }
        
        // -1
        fireEvent.click(decrementBtn);
        expected = Math.max(0, expected - 1);
        
        // +4
        for (let i = 0; i < 4; i++) {
            fireEvent.click(incrementBtn);
            expected++;
        }
        
        // -2
        for (let i = 0; i < 2; i++) {
            fireEvent.click(decrementBtn);
            expected = Math.max(0, expected - 1);
        }
        
        expect(countDisplay).toHaveTextContent(String(expected));
    });
});
`,

    // React-specific dependencies
    dependencies: {
        'react': '^18.2.0',
        'react-dom': '^18.2.0',
    },

    // Dev dependencies for testing
    devDependencies: {
        '@testing-library/react': '^14.0.0',
        '@testing-library/jest-dom': '^6.1.0',
        '@babel/preset-react': '^7.22.0',
        '@babel/preset-env': '^7.22.0',
        'jest-environment-jsdom': '^29.7.0',
    },

    // Jest config for React
    jestConfig: {
        testEnvironment: 'jsdom',
        setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
        moduleFileExtensions: ['js', 'jsx'],
        transform: {
            '^.+\\.jsx?$': 'babel-jest',
        },
    },

    // Babel config
    babelConfig: {
        presets: [
            '@babel/preset-env',
            ['@babel/preset-react', { runtime: 'automatic' }],
        ],
    },

    nodeVersion: '20',
};


