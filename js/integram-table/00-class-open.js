/**
 * IntegramTable Component
 * Standalone JS module for displaying Integram API data tables with infinite scroll
 *
 * Features:
 * - Automatic column hiding for ID and Style suffix columns
 * - Infinite scroll instead of pagination
 * - Dynamic filtering with 13+ filter operators
 * - Drag & drop column reordering
 * - Column visibility settings
 * - Cookie-based state persistence
 * - Custom cell styling via style columns
 * - Clickable "?" to fetch total record count
 */

const itModalEscapeState = {
    stack: [],
    keydownHandler: null
};

function itIsModalConnected(modal) {
    if (!modal) return false;
    if (typeof modal.isConnected === 'boolean') return modal.isConnected;
    return !!(document.documentElement && document.documentElement.contains(modal));
}

/**
 * Register a modal in the shared Escape stack and return an idempotent close
 * function. A single document listener serves every table instance, so closing
 * a modal by a button, backdrop, save action, or DOM removal cannot leave a
 * stale global keydown listener behind.
 */
function itCreateModalCloseHandler(modal, closeCallback) {
    let active = true;
    let observer = null;
    const entry = { modal, close: null, unregister: null };

    const unregister = () => {
        if (!active) return;
        active = false;
        if (observer) observer.disconnect();
        const index = itModalEscapeState.stack.indexOf(entry);
        if (index !== -1) itModalEscapeState.stack.splice(index, 1);
        if (itModalEscapeState.stack.length === 0 && itModalEscapeState.keydownHandler) {
            document.removeEventListener('keydown', itModalEscapeState.keydownHandler);
            itModalEscapeState.keydownHandler = null;
        }
    };

    const close = (...args) => {
        if (!active) return;
        unregister();
        return closeCallback(...args);
    };

    entry.close = close;
    entry.unregister = unregister;
    itModalEscapeState.stack.push(entry);

    if (!itModalEscapeState.keydownHandler) {
        itModalEscapeState.keydownHandler = (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            while (itModalEscapeState.stack.length > 0) {
                const top = itModalEscapeState.stack[itModalEscapeState.stack.length - 1];
                if (!itIsModalConnected(top.modal)) {
                    top.unregister();
                    continue;
                }
                top.close();
                break;
            }
        };
        document.addEventListener('keydown', itModalEscapeState.keydownHandler);
    }

    if (typeof MutationObserver !== 'undefined' && document.documentElement) {
        observer = new MutationObserver(() => {
            if (!itIsModalConnected(modal)) unregister();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    return close;
}

class IntegramTable{
