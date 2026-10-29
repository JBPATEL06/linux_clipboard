/**
 * ClipboardPopup for Antigravity Clipboard
 * Modal popup placed directly at the cursor position with boundary clamping,
 * responsive display scaling, 5-items-per-page pagination, and instant auto-paste.
 */
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GLib from 'gi://GLib';
import { CardView } from './cardView.js';

const ITEMS_PER_PAGE = 5;

export class ClipboardPopup {
    constructor(clipboardManager, settings) {
        this.manager = clipboardManager;
        this.settings = settings;
        this.currentPage = 1;
        this.searchQuery = '';
        this.isOpen = false;
        this._cardButtons = [];

        // Window drag state
        this._isDragging = false;
        this._dragStartX = 0;
        this._dragStartY = 0;
        this._boxStartX = 0;
        this._boxStartY = 0;

        // Live real-time update when new screenshots or items arrive!
        this.manager.onHistoryChanged = () => {
            if (this.isOpen) {
                this.render();
            }
        };

        // Root overlay covering the screen to handle click-outside dismissal
        this.root = new St.Widget({
            style_class: 'clipboard-popup-root',
            reactive: true,
            can_focus: true,
            track_hover: true,
            visible: false
        });

        this._buildUI();
        this._setupEvents();
    }

    _buildUI() {
        this.box = new St.BoxLayout({
            vertical: true,
            style_class: 'clipboard-popup-window',
            reactive: true,
            can_focus: true
        });
        this.root.add_child(this.box);

        // 1. Header Bar: Title + Total Counter + Drag Handle + Trash / Clear
        this.header = new St.BoxLayout({
            vertical: false,
            style_class: 'clipboard-header',
            reactive: true
        });
        this.titleLbl = new St.Label({
            text: 'Clipboard',
            style_class: 'clipboard-header-title'
        });
        this.header.add_child(this.titleLbl);

        this.counterBadge = new St.Label({
            text: '0 items',
            style_class: 'clipboard-counter-badge'
        });
        this.header.add_child(this.counterBadge);

        const dragPill = new St.Label({
            text: 'drag to move',
            style_class: 'clipboard-drag-pill'
        });
        this.header.add_child(dragPill);

        const spacer = new St.Widget({ x_expand: true, reactive: false });
        this.header.add_child(spacer);

        // Clear all history button
        const clearBtn = new St.Button({
            style_class: 'clipboard-header-icon-btn',
            reactive: true,
            child: new St.Icon({
                icon_name: 'user-trash-symbolic',
                icon_size: 14
            })
        });
        clearBtn.connect('button-press-event', () => Clutter.EVENT_STOP);
        clearBtn.connect('clicked', () => {
            this.manager.clearHistory();
            this.currentPage = 1;
            this.render();
        });
        this.header.add_child(clearBtn);

        this.box.add_child(this.header);

        // 2. Search Field
        const searchBox = new St.BoxLayout({
            vertical: false,
            style_class: 'clipboard-search-box'
        });
        const searchIcon = new St.Icon({
            icon_name: 'system-search-symbolic',
            icon_size: 14,
            style_class: 'clipboard-search-icon'
        });
        searchBox.add_child(searchIcon);

        this.searchEntry = new St.Entry({
            hint_text: 'Search clipboard...',
            style_class: 'clipboard-search-entry',
            can_focus: true,
            x_expand: true
        });
        this.searchEntry.clutter_text.connect('text-changed', () => {
            this.searchQuery = this.searchEntry.get_text().toLowerCase().trim();
            this.currentPage = 1;
            this.render();
        });
        searchBox.add_child(this.searchEntry);

        const shortcutBadge = new St.Label({
            text: 'Ctrl+V',
            style_class: 'clipboard-ctrlv-badge'
        });
        searchBox.add_child(shortcutBadge);

        this.box.add_child(searchBox);

        // 3. Card Scroll Container (Holds 5 items with smooth scrolling & fixed max height)
        this.scrollView = new St.ScrollView({
            style_class: 'clipboard-scroll-view',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            enable_mouse_scrolling: true,
            x_expand: true,
            y_expand: false
        });

        this.cardsBox = new St.BoxLayout({
            vertical: true,
            style_class: 'clipboard-cards-box',
            x_expand: true
        });
        this.scrollView.add_child(this.cardsBox);
        this.box.add_child(this.scrollView);

        // 4. Pagination Footer (< [ 1 / N ] >)
        this.paginationBar = new St.BoxLayout({
            vertical: false,
            style_class: 'clipboard-pagination-bar',
            x_align: Clutter.ActorAlign.CENTER
        });

        this.prevBtn = new St.Button({
            style_class: 'pagination-nav-btn',
            child: new St.Icon({
                icon_name: 'go-previous-symbolic',
                icon_size: 12
            })
        });
        this.prevBtn.connect('clicked', () => this.prevPage());
        this.paginationBar.add_child(this.prevBtn);

        this.pageBadge = new St.Label({
            text: '1',
            style_class: 'pagination-page-badge'
        });
        this.paginationBar.add_child(this.pageBadge);

        this.nextBtn = new St.Button({
            style_class: 'pagination-nav-btn',
            child: new St.Icon({
                icon_name: 'go-next-symbolic',
                icon_size: 12
            })
        });
        this.nextBtn.connect('clicked', () => this.nextPage());
        this.paginationBar.add_child(this.nextBtn);

        this.box.add_child(this.paginationBar);
    }

    _setupEvents() {
        // 1. Mouse Dragging on Header Bar to freely move the window
        this.header.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) { // Left mouse button
                this._isDragging = true;
                const [cx, cy] = event.get_coords();
                this._dragStartX = cx;
                this._dragStartY = cy;
                const [bx, by] = this.box.get_position();
                this._boxStartX = bx;
                this._boxStartY = by;
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this.root.connect('motion-event', (actor, event) => {
            if (this._isDragging) {
                const [cx, cy] = event.get_coords();
                const deltaX = cx - this._dragStartX;
                const deltaY = cy - this._dragStartY;

                const monitor = Main.layoutManager.currentMonitor;
                const [boxW, boxH] = this.box.get_transformed_size();
                const newX = Math.max(8, Math.min(monitor.width - boxW - 8, this._boxStartX + deltaX));
                const newY = Math.max(8, Math.min(monitor.height - boxH - 8, this._boxStartY + deltaY));

                this.box.set_position(newX, newY);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this.root.connect('button-release-event', (actor, event) => {
            if (this._isDragging) {
                this._isDragging = false;
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // 2. Dismiss when clicking outside popup
        this.root.connect('button-press-event', (actor, event) => {
            if (this._isDragging) return Clutter.EVENT_STOP;

            const [clickX, clickY] = event.get_coords();
            const [boxX, boxY] = this.box.get_transformed_position();
            const [boxW, boxH] = this.box.get_transformed_size();

            if (clickX < boxX || clickX > boxX + boxW || clickY < boxY || clickY > boxY + boxH) {
                this.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Keyboard Handling
        this.root.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();

            if (symbol === Clutter.KEY_Escape) {
                this.close();
                return Clutter.EVENT_STOP;
            }

            // Quick digits 1-5 for instant item paste (only when not editing search entry)
            if (!this.searchEntry.clutter_text.has_key_focus()) {
                if (symbol >= Clutter.KEY_1 && symbol <= Clutter.KEY_5) {
                    const idx = symbol - Clutter.KEY_1;
                    const filtered = this._getFilteredItems();
                    const item = filtered[(this.currentPage - 1) * ITEMS_PER_PAGE + idx];
                    if (item) {
                        this._selectItem(item);
                        return Clutter.EVENT_STOP;
                    }
                }

                // Left / Right arrow pagination
                if (symbol === Clutter.KEY_Left) {
                    this.prevPage();
                    return Clutter.EVENT_STOP;
                }
                if (symbol === Clutter.KEY_Right) {
                    this.nextPage();
                    return Clutter.EVENT_STOP;
                }

                // If user starts typing alphanumeric characters, divert to search entry!
                const unicode = Clutter.keysym_to_unicode(symbol);
                if (unicode > 32 && unicode < 127) {
                    this.searchEntry.grab_key_focus();
                    return Clutter.EVENT_PROPAGATE;
                }
            }

            return Clutter.EVENT_PROPAGATE;
        });
    }

    _getFilteredItems() {
        if (!this.searchQuery) return this.manager.items;
        return this.manager.items.filter(it => {
            const title = (it.title || '').toLowerCase();
            const content = (it.content || '').toLowerCase();
            const sub = (it.subtitle || '').toLowerCase();
            return title.includes(this.searchQuery) || content.includes(this.searchQuery) || sub.includes(this.searchQuery);
        });
    }

    render() {
        this.cardsBox.destroy_all_children();
        this._cardButtons = [];

        const filtered = this._getFilteredItems();
        const total = filtered.length;
        this.counterBadge.set_text(`${total} items`);

        const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        this.pageBadge.set_text(`${this.currentPage} / ${totalPages}`);
        this.prevBtn.reactive = this.currentPage > 1;
        this.nextBtn.reactive = this.currentPage < totalPages;

        if (total === 0) {
            const emptyBox = new St.BoxLayout({
                vertical: true,
                style_class: 'clipboard-empty-box',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER
            });
            const emptyLbl = new St.Label({
                text: 'No clipboard items\nCopy something to see it here!',
                style_class: 'clipboard-empty-lbl'
            });
            emptyBox.add_child(emptyLbl);
            this.cardsBox.add_child(emptyBox);
            return;
        }

        const start = (this.currentPage - 1) * ITEMS_PER_PAGE;
        const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);

        pageItems.forEach((item, index) => {
            const card = CardView.createCard(
                item,
                index + 1,
                (selected) => this._selectItem(selected),
                (deleteId) => {
                    this.manager.deleteItem(deleteId);
                    this.render();
                }
            );
            this._cardButtons.push(card);
            this.cardsBox.add_child(card);
        });
    }

    _selectItem(item) {
        this.close();
        this.manager.pasteItem(item);
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.render();
        }
    }

    nextPage() {
        const filtered = this._getFilteredItems();
        const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.render();
        }
    }

    openAtCursor() {
        this.manager.saveCurrentFocus();
        this.searchEntry.set_text('');
        this.searchQuery = '';
        this.currentPage = 1;
        this.render();

        const monitor = Main.layoutManager.currentMonitor;
        const [pointerX, pointerY] = global.get_pointer();

        // Responsive width
        const popupWidth = Math.min(390, Math.floor(monitor.width * 0.35));
        this.box.set_width(popupWidth);

        // Limit scrollView height so entire popup always fits comfortably on screen
        const maxScrollHeight = Math.min(480, Math.floor(monitor.height * 0.62));
        this.scrollView.set_style(`max-height: ${maxScrollHeight}px;`);

        // Overlay full monitor for click-outside dismissal
        this.root.set_size(monitor.width, monitor.height);
        this.root.set_position(monitor.x, monitor.y);

        this.root.visible = true;
        this.isOpen = true;
        Main.uiGroup.add_child(this.root);

        // Accurate placement directly at pointer
        const [, naturalHeight] = this.box.get_preferred_height(popupWidth);
        const actualHeight = Math.max(160, Math.min(naturalHeight, Math.floor(monitor.height * 0.85)));

        let targetX = pointerX + 8;
        let targetY = pointerY + 8;

        // If overflowing right edge, flip to left of cursor
        if (targetX + popupWidth > monitor.x + monitor.width - 12) {
            targetX = pointerX - popupWidth - 8;
        }
        // If overflowing bottom edge, flip above the cursor
        if (targetY + actualHeight > monitor.y + monitor.height - 12) {
            targetY = pointerY - actualHeight - 8;
        }

        // Keep strictly inside screen on all sides so pagination footer is never pushed off
        targetX = Math.max(monitor.x + 8, Math.min(monitor.x + monitor.width - popupWidth - 8, targetX));
        targetY = Math.max(monitor.y + 8, Math.min(monitor.y + monitor.height - actualHeight - 8, targetY));

        // Relative coordinates inside root
        this.box.set_position(targetX - monitor.x, targetY - monitor.y);

        // Focus root/box so 1-5 keys paste immediately and screenshots aren't blocked!
        this.box.grab_key_focus();
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.root.visible = false;

        if (this.root.get_parent()) {
            Main.uiGroup.remove_child(this.root);
        }
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.openAtCursor();
        }
    }

    destroy() {
        this.close();
        if (this.root) {
            this.root.destroy();
            this.root = null;
        }
    }
}
