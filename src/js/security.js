/**
 * security.js
 * Advanced Coordinate Conversion Tool - Security Layer
 * This script implements various deterrents to prevent casual code inspection and DevTools usage.
 */

(function () {
    'use strict';

    // Check if running on a local development server (VS Code Live Server, etc.)
    // If local, we skip all security measures to allow development debugging.
    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.protocol === 'file:';

    if (isLocal) {
        console.log('🛡️ Security Layer: Development environment detected. Protections disabled.');
        return;
    }

    // Add locking class to body for CSS protections
    document.body.classList.add('security-locked');

    // 1. Disable Right-Click Context Menu
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    }, false);

    // 2. Disable Keyboard Shortcuts for DevTools & Source View
    document.addEventListener('keydown', function (e) {
        // F12
        if (e.keyCode === 123) {
            e.preventDefault();
            return false;
        }

        // Ctrl+Shift+I (Inspect)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
            e.preventDefault();
            return false;
        }

        // Ctrl+Shift+J (Console)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
            e.preventDefault();
            return false;
        }

        // Ctrl+Shift+C (Element Select)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
            e.preventDefault();
            return false;
        }

        // Ctrl+U (View Source)
        if (e.ctrlKey && e.keyCode === 85) {
            e.preventDefault();
            return false;
        }

        // Ctrl+S (Save Page)
        if (e.ctrlKey && e.keyCode === 83) {
            e.preventDefault();
            return false;
        }
    }, false);

    // 3. Debugger Trap
    // This will pause the browser if DevTools is opened.
    const startDebuggerTrap = function () {
        setInterval(function () {
            (function () {
                return false;
            }
                ["constructor"]("debugger")
                ["call"]());
        }, 500);
    };

    // 4. Console Protection
    // Clear console frequently and show a warning
    const protectConsole = function () {
        const warningStyle = 'color: red; font-size: 20px; font-weight: bold; text-shadow: 1px 1px 2px black;';
        const msgStyle = 'color: #764ba2; font-size: 14px;';
        
        setInterval(function () {
            console.clear();
            console.log('%c⚠️ STOP! ⚠️', warningStyle);
            console.log('%cThis is a protected industrial tool. Any attempt to access or modify this code is prohibited.', msgStyle);
            console.log('%cAuthorized usage only. © 2026 M. Mubeen Maroof', 'color: gray; font-style: italic;');
        }, 1000);
    };

    // Initialize Protections
    try {
        startDebuggerTrap();
        protectConsole();
    } catch (err) {
        // Silently fail if browser blocks these techniques
    }

    // 5. Detect if DevTools is open via window size (Legacy but still somewhat effective)
    let threshold = 160;
    setInterval(function() {
        if (window.outerWidth - window.innerWidth > threshold || 
            window.outerHeight - window.innerHeight > threshold) {
            // DevTools is likely open as a side pane or bottom pane
            // We could redirect or show a blank screen, but the debugger trap is usually enough.
        }
    }, 1000);

})();
