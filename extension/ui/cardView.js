/**
 * CardView for Antigravity Clipboard
 * Builds rich cards matching the user's wireframe:
 * - High-res Image & Animated GIF preview card (from Chrome, web, or screenshots)
 * - Copied text with emoji support
 * - 5-line Code block card with file name header
 * - File card (single & multiple) with name and file size (file drop support)
 * - Color swatch card
 */
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class CardView {
    static createCard(item, indexOnPage, onSelectCallback, onDeleteCallback) {
        const button = new St.Button({
            style_class: 'clipboard-card-button',
            reactive: true,
            can_focus: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL
        });

        const mainContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'clipboard-card-container',
            x_expand: true
        });
        button.set_child(mainContainer);

        // Top Row: Item number pill (1-5 for instant keyboard paste) + Type indicator + Delete button
        const topBar = new St.BoxLayout({
            vertical: false,
            style_class: 'card-top-bar',
            x_expand: true
        });

        const numPill = new St.Label({
            text: `${indexOnPage}`,
            style_class: 'card-num-pill'
        });
        topBar.add_child(numPill);

        const spacer = new St.Widget({ x_expand: true });
        topBar.add_child(spacer);

        // Delete button
        const deleteBtn = new St.Button({
            style_class: 'card-delete-btn',
            child: new St.Icon({
                icon_name: 'edit-delete-symbolic',
                icon_size: 13,
                style_class: 'card-delete-icon'
            })
        });
        deleteBtn.connect('clicked', () => {
            if (onDeleteCallback) onDeleteCallback(item.id);
        });
        topBar.add_child(deleteBtn);

        mainContainer.add_child(topBar);

        // Render card body based on type
        switch (item.type) {
            case 'image':
                mainContainer.add_child(CardView._buildImageCard(item));
                break;
            case 'code':
                mainContainer.add_child(CardView._buildCodeCard(item));
                break;
            case 'file':
                mainContainer.add_child(CardView._buildFileCard(item));
                break;
            case 'color':
                mainContainer.add_child(CardView._buildColorCard(item));
                break;
            case 'text':
            case 'command':
            default:
                mainContainer.add_child(CardView._buildTextCard(item));
                break;
        }

        button.connect('clicked', () => {
            if (onSelectCallback) onSelectCallback(item);
        });

        return button;
    }

    // 1. Image & GIF Card
    static _buildImageCard(item) {
        const box = new St.BoxLayout({
            vertical: true,
            style_class: 'image-card-box',
            x_expand: true
        });

        const hasValidFile = item.filePath && GLib.file_test(item.filePath, GLib.FileTest.EXISTS);

        // Direct CSS background-image renders any image format or screenshot with native performance
        const previewFrame = new St.Widget({
            style_class: 'image-preview-frame',
            x_expand: true,
            style: hasValidFile
                ? `background-image: url("file://${item.filePath}"); background-size: contain; background-repeat: no-repeat; background-position: center; min-height: 140px;`
                : 'min-height: 70px;'
        });

        if (!hasValidFile) {
            const fallbackIcon = new St.Icon({
                icon_name: 'image-x-generic',
                icon_size: 48,
                style_class: 'image-fallback-icon',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER
            });
            previewFrame.add_child(fallbackIcon);
        }

        box.add_child(previewFrame);

        // Subtitle bar
        const infoBar = new St.BoxLayout({
            vertical: false,
            style_class: 'card-info-bar'
        });

        const formatBadge = new St.Label({
            text: item.isGif ? 'GIF' : (item.format || 'IMAGE'),
            style_class: 'card-chip-badge'
        });
        infoBar.add_child(formatBadge);

        const subLbl = new St.Label({
            text: ` ${item.title} • ${item.fileSize || ''}`,
            style_class: 'card-subtitle-lbl'
        });
        subLbl.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        infoBar.add_child(subLbl);

        box.add_child(infoBar);
        return box;
    }

    // 2. Code Block Card (Strictly First 5 Lines + File Name Header)
    static _buildCodeCard(item) {
        const box = new St.BoxLayout({
            vertical: true,
            style_class: 'code-card-box',
            x_expand: true
        });

        // Header: "file name if available"
        const headerBar = new St.BoxLayout({
            vertical: false,
            style_class: 'code-header-bar'
        });
        const fileIcon = new St.Icon({
            icon_name: 'text-x-generic-symbolic',
            icon_size: 13,
            style_class: 'code-file-icon'
        });
        headerBar.add_child(fileIcon);

        const fileNameLbl = new St.Label({
            text: ` ${item.fileName || 'Code Snippet'}`,
            style_class: 'code-filename-lbl'
        });
        headerBar.add_child(fileNameLbl);

        box.add_child(headerBar);

        // Code Body Box: Monospace with strictly 5 lines
        const codeBox = new St.BoxLayout({
            vertical: true,
            style_class: 'code-inner-frame',
            x_expand: true
        });

        const lines = item.lines || (item.content ? item.content.split('\n').slice(0, 5) : ['// Code']);
        lines.slice(0, 5).forEach((lineText, idx) => {
            const lineRow = new St.BoxLayout({
                vertical: false,
                style_class: 'code-line-row'
            });

            const lineNum = new St.Label({
                text: `${idx + 1} `,
                style_class: 'code-line-num'
            });
            lineRow.add_child(lineNum);

            const codeText = new St.Label({
                text: lineText || ' ',
                style_class: 'code-line-text'
            });
            codeText.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            lineRow.add_child(codeText);

            codeBox.add_child(lineRow);
        });

        box.add_child(codeBox);

        // If truncated, show "+ N more lines"
        if (item.total_lines > 5) {
            const moreLbl = new St.Label({
                text: `+ ${item.total_lines - 5} more lines`,
                style_class: 'code-more-lbl'
            });
            box.add_child(moreLbl);
        }

        return box;
    }

    // 3. Copied File Card (Single & Multiple Files with File Size)
    static _buildFileCard(item) {
        const box = new St.BoxLayout({
            vertical: false,
            style_class: 'file-card-box',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });

        const icon = new St.Icon({
            icon_name: item.iconName || 'text-x-generic',
            icon_size: 26,
            style_class: 'file-type-icon'
        });
        box.add_child(icon);

        const nameLbl = new St.Label({
            text: ` ${item.title || 'Copied File'}`,
            style_class: 'file-name-lbl',
            x_expand: true
        });
        nameLbl.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(nameLbl);

        // File size on right side
        const sizeBadge = new St.Label({
            text: item.fileSize || 'File',
            style_class: 'file-size-badge',
            y_align: Clutter.ActorAlign.CENTER
        });
        box.add_child(sizeBadge);

        return box;
    }

    // 4. Color Swatch Card
    static _buildColorCard(item) {
        const box = new St.BoxLayout({
            vertical: false,
            style_class: 'color-card-box',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });

        const swatch = new St.Widget({
            style_class: 'color-swatch-circle',
            style: `background-color: ${item.hex || '#0A84FF'};`
        });
        box.add_child(swatch);

        const textCol = new St.BoxLayout({ vertical: true, x_expand: true });
        const hexLbl = new St.Label({
            text: `${item.hex || '#0A84FF'}`,
            style_class: 'color-hex-title'
        });
        textCol.add_child(hexLbl);

        const nameLbl = new St.Label({
            text: item.colorName || 'Color',
            style_class: 'card-subtitle-lbl'
        });
        textCol.add_child(nameLbl);

        box.add_child(textCol);

        const hexBadge = new St.Label({
            text: 'HEX',
            style_class: 'card-chip-badge',
            y_align: Clutter.ActorAlign.CENTER
        });
        box.add_child(hexBadge);

        return box;
    }

    // 5. Copied Text Card
    static _buildTextCard(item) {
        const box = new St.BoxLayout({
            vertical: true,
            style_class: 'text-card-box',
            x_expand: true
        });

        const titleLbl = new St.Label({
            text: item.title || 'Copied text',
            style_class: 'text-card-title'
        });
        titleLbl.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(titleLbl);

        const subLbl = new St.Label({
            text: item.subtitle || 'Text',
            style_class: 'card-subtitle-lbl'
        });
        box.add_child(subLbl);

        return box;
    }
}
