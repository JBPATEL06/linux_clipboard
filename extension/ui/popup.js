/**
 * ClipboardPopup for Antigravity Clipboard
 * Modal popup placed at the cursor position with boundary clamping,
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
        this._modalGrab = false;

        // Root container covering the monitor for click-outside detection
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

        // 1. Header Bar: Title + Total Counter + Trash / Clear
        const header = new St.BoxLayout({
            vertical: false,
            style_class: 'clipboard-header'
        });
        this.titleLbl = new St.Label({
            text: 'Clipboard',
            style_class: 'clipboard-header-title'
        });
        header.add_child(this.titleLbl);

        this.counterBadge = new St.Label({
            text: '0 items',
            style_class: 'clipboard-counter-badge'
        });
        header.add_child(this.counterBadge);

        const spacer = new St.Widget({ x_expand: true });
        header.add_child(spacer);

        // Trash / Clear button
        const clearBtn = new St.Button({
            style_class: 'clipboard-header-icon-btn',
            child: new St.Icon({
                icon_name: 'user-trash-symbolic',
                icon_size: 14
            })
        });
        clearBtn.connect('clicked', () => {
            this.manager.clearHistory();
            this.currentPage = 1;
            this.render();
        });
        header.add_child(clearBtn);

        this.box.add_child(header);

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

        // 3. Card Container (Holds strictly 5 items)
        this.cardsBox = new St.BoxLayout({
            vertical: true,
            style_class: 'clipboard-cards-box'
        });
        this.box.add_child(this.cardsBox);

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
        // Close on clicking outside popup
        this.root.connect('button-press-event', (actor, event) => {
            const [clickX, clickY] = event.get_coords();
            const [boxX, boxY] = this.box.get_transformed_position();
            const [boxW, boxH] = this.box.get_transformed_size();

            if (clickX < boxX || clickX > boxX + boxW || clickY < boxY || clickY > boxY + boxH) {
                this.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Key Press Navigation
        this.root.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();

            if (symbol === Clutter.KEY_Escape) {
                this.close();
                return Clutter.EVENT_STOP;
            }

            // Number keys 1-5 for instant paste
            if (symbol >= Clutter.KEY_1 && symbol <= Clutter.KEY_5) {
                const idx = symbol - Clutter.KEY_1;
                const filtered = this._getFilteredItems();
                const item = filtered[(this.currentPage - 1) * ITEMS_PER_PAGE + idx];
                if (item) {
                    this._selectItem(item);
                    return Clutter.EVENT_STOP;
                }
            }

            // Left / Right arrows for pagination (when not editing search entry text)
            if (symbol === Clutter.KEY_Left && !this.searchEntry.clutter_text.has_key_focus()) {
                this.prevPage();
                return Clutter.EVENT_STOP;
            }
            if (symbol === Clutter.KEY_Right && !this.searchEntry.clutter_text.has_key_focus()) {
                this.nextPage();
                return Clutter.EVENT_STOP;
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

        // Responsive sizing: adapts to display
        const popupWidth = Math.min(380, Math.floor(monitor.width * 0.35));
        const popupHeight = Math.min(680, Math.floor(monitor.height * 0.85));

        this.box.set_width(popupWidth);

        // Clamping to screen boundaries so it never overflows
        let targetX = pointerX - 20;
        let targetY = pointerY - 20;

        if (targetX + popupWidth > monitor.x + monitor.width - 15) {
            targetX = monitor.x + monitor.width - popupWidth - 15;
        }
        if (targetX < monitor.x + 15) {
            targetX = monitor.x + 15;
        }

        if (targetY + popupHeight > monitor.y + monitor.height - 15) {
            targetY = monitor.y + monitor.height - popupHeight - 15;
        }
        if (targetY < monitor.y + 15) {
            targetY = monitor.y + 15;
        }

        this.box.set_position(targetX, targetY);

        this.root.set_size(monitor.width, monitor.height);
        this.root.set_position(monitor.x, monitor.y);

        this.root.visible = true;
        this.isOpen = true;
        Main.uiGroup.add_child(this.root);

        // Push modal focus so all keys and clicks are captured cleanly
        try {
            if (Main.pushModal(this.root)) {
                this._modalGrab = true;
            }
        } catch (e) {
            // Fallback to grab_key_focus
            this.root.grab_key_focus();
        }

        this.searchEntry.grab_key_focus();
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.root.visible = false;

        if (this._modalGrab) {
            try {
                Main.popModal(this.root);
            } catch (e) {
                // Ignore pop errors
            }
            this._modalGrab = false;
        }

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
