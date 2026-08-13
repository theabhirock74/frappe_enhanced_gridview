import GridRow from './grid_row';
import Grid from './grid';

// Enhanced grid is horizontally scrollable — allow more than 10 column units.
function allow_scrollable_column_widths() {
	if (frappe?.ui?.form?.GridRow?.prototype && !frappe.ui.form.GridRow.prototype._enhanced_grid_width_patched) {
		frappe.ui.form.GridRow.prototype.validate_columns_width = function () {
			// no-op: column widths may exceed 10 when the grid scrolls horizontally
		};
		frappe.ui.form.GridRow.prototype._enhanced_grid_width_patched = true;
	}
}

allow_scrollable_column_widths();

class Custom_GridRow extends GridRow {

	validate_columns_width() {
		// Scrollable enhanced grid — do not enforce the default max width of 10.
	}

	show_form() {
		super.show_form();

		if (this.grid_form?.wrapper?.length) {
			this.grid_form.wrapper.css("display", "block");
		}
		$(this.grid.form_grid).removeClass("relative-important");
		this.grid.enter_row_form_mode?.(this);
	}
	hide_form() {
		super.hide_form();

		if (this.grid_form?.wrapper?.length) {
			this.grid_form.wrapper.css("display", "none");
		}
		$(this.grid.form_grid).addClass("relative-important");
		this.grid.leave_row_form_mode?.(this);
	}
}


class Custom_Grid extends Grid {

	has_sticky_columns() {
		return (this.docfields || []).some(
			(df) => cint(df.sticky_in_grid) && df.in_list_view && !df.hidden
		);
	}

	get_sticky_column_key($col) {
		if ($col.hasClass("row-check")) {
			return "__check__";
		}
		if ($col.hasClass("row-index")) {
			return "__index__";
		}
		return $col.data("fieldname");
	}

	is_sticky_column($col) {
		return (
			$col.hasClass("row-check") ||
			$col.hasClass("row-index") ||
			$col.hasClass("grid-sticky-col")
		);
	}

	get_column_width(colsize) {
		return colsize * 50 + 100;
	}

	sync_column_widths() {
		if (!this.form_grid?.length) {
			return;
		}

		const $reference_row = this.form_grid
			.find(".grid-heading-row .grid-row:not(.filter-row) .data-row")
			.first();

		if (!$reference_row.length) {
			return;
		}

		const $ref_cols = $reference_row.children(".col");
		const widths = $ref_cols.map((_, el) => Math.round($(el).outerWidth())).get();

		this.form_grid
			.find(".grid-heading-row .grid-row .data-row, .grid-body .grid-row .data-row")
			.each(function () {
				$(this)
					.children(".col")
					.each(function (index) {
						const width = widths[index];
						if (!width) {
							return;
						}

						$(this).css({
							flex: `0 0 ${width}px`,
							width: `${width}px`,
							minWidth: `${width}px`,
							maxWidth: `${width}px`,
						});
					});
			});

		this.sticky_column_widths = widths;
	}

	setup_sticky_columns() {
		if (!this.form_grid_container) {
			return;
		}

		this.form_grid.find(".data-row > .col").removeClass("grid-sticky-last").css({
			position: "",
			left: "",
			zIndex: "",
		});

		if (!this.has_sticky_columns()) {
			this.form_grid_container.removeClass("has-sticky-columns");
			return;
		}

		this.sync_column_widths();

		this.form_grid_container.addClass("has-sticky-columns");

		const $reference_row = this.form_grid
			.find(".grid-heading-row .grid-row:not(.filter-row) .data-row")
			.first();

		if (!$reference_row.length) {
			return;
		}

		const me = this;
		const $ref_cols = $reference_row.children(".col");
		const sticky_left_by_index = new Map();
		let left_offset = 0;
		let last_sticky_index = null;

		$ref_cols.each(function (index) {
			const $col = $(this);
			if (me.is_sticky_column($col)) {
				sticky_left_by_index.set(index, left_offset);
				last_sticky_index = index;
			}
			left_offset += me.sticky_column_widths?.[index] || Math.round($col.outerWidth());
		});

		const apply_sticky = ($row) => {
			const is_heading = $row.closest(".grid-heading-row").length > 0;
			$row.children(".col").each(function (index) {
				const $col = $(this);

				if (!sticky_left_by_index.has(index)) {
					$col.css({
						position: "",
						left: "",
						zIndex: "",
					});
					return;
				}

				$col.css({
					position: "sticky",
					left: `${sticky_left_by_index.get(index)}px`,
					zIndex: is_heading ? 4 : $col.hasClass("grid-static-col") ? 2 : 3,
				});

				if (index === last_sticky_index) {
					$col.addClass("grid-sticky-last");
				}
			});
		};

		this.form_grid.find(".grid-heading-row .grid-row .data-row").each(function () {
			apply_sticky($(this));
		});
		this.form_grid.find(".grid-body .grid-row .data-row").each(function () {
			apply_sticky($(this));
		});
	}

	get_page_sticky_top() {
		const root_styles = getComputedStyle(document.documentElement);
		let navbar = parseInt(root_styles.getPropertyValue("--navbar-height"), 10);
		if (Number.isNaN(navbar)) {
			navbar = 48;
		}

		const $tabs = $(".form-tabs-list").filter(":visible").first();
		if ($tabs.length) {
			const tabs_rect = $tabs[0].getBoundingClientRect();
			// Tabs are sticky near the top — pin header exactly under them.
			if (tabs_rect.bottom > 0 && tabs_rect.top < navbar + 120) {
				return Math.round(tabs_rect.bottom);
			}
		}

		let top = navbar;
		const $page_head = $(".page-head").first();
		if ($page_head.length) {
			const head_rect = $page_head[0].getBoundingClientRect();
			if (head_rect.bottom > navbar - 2 && head_rect.top < navbar + 20) {
				top = Math.round(head_rect.bottom);
			}
		}

		top += $tabs.length ? Math.round($tabs.outerHeight()) : 52;
		return top;
	}

	ensure_sticky_header_clone($heading) {
		if (this._sticky_header_clone?.length) {
			return this._sticky_header_clone;
		}

		this._sticky_header_clone = $("<div>")
			.addClass("grid-heading-row enhanced-grid-sticky-clone")
			.attr("aria-hidden", "true");
		if ($heading.hasClass("with-filter")) {
			this._sticky_header_clone.addClass("with-filter");
		}
		$("body").append(this._sticky_header_clone);
		return this._sticky_header_clone;
	}

	remove_sticky_header_clone() {
		if (this._sticky_header_clone?.length) {
			this._sticky_header_clone.remove();
			this._sticky_header_clone = null;
		}
	}

	refresh_sticky_header_clone_content($heading) {
		const $clone = this._sticky_header_clone;
		if (!$clone?.length || !$heading?.length) {
			return;
		}

		// Only the label row — skip filter/search row (empty grey boxes).
		const $label_row = $heading.children(".grid-row:not(.filter-row)").first();
		$clone.empty();
		if ($label_row.length) {
			$clone.append($label_row.clone(false, false));
		}
		$clone.removeClass("with-filter");
		$clone.find("input, button, select, textarea").prop("disabled", true);
	}

	sync_sticky_header_clone($heading, $clone, container_rect, scroll_left, sticky_top) {
		const grid_width = Math.round(this.form_grid.outerWidth()) || container_rect.width;
		const $label_row = $heading.children(".grid-row:not(.filter-row)").first();
		const heading_height =
			this._sticky_heading_height ||
			Math.round($label_row.outerHeight()) ||
			Math.round($clone.outerHeight()) ||
			32;

		$clone.css({
			position: "fixed",
			top: `${sticky_top}px`,
			left: `${Math.round(container_rect.left)}px`,
			width: `${Math.round(container_rect.width)}px`,
			height: `${heading_height}px`,
			minHeight: `${heading_height}px`,
			zIndex: 1010,
			overflow: "hidden",
			display: "block",
			visibility: "visible",
			opacity: 1,
			margin: 0,
			padding: 0,
			backgroundColor: "var(--subtle-fg)",
			boxShadow: "0 2px 6px rgba(0, 0, 0, 0.12)",
			borderBottom: "1px solid var(--table-border-color)",
			pointerEvents: "none",
		});

		$clone.children(".grid-row").css({
			width: `${grid_width}px`,
			minWidth: `${grid_width}px`,
			backgroundColor: "var(--subtle-fg)",
		});

		$clone[0].scrollLeft = scroll_left;

		// Only copy metrics while source heading is still laid out (not collapsed).
		if ($heading.hasClass("is-page-sticky")) {
			return;
		}

		const $src_row = $label_row.find(".data-row").first();
		const $dst_row = $clone.find(".data-row").first();
		if (!$src_row.length || !$dst_row.length) {
			return;
		}

		$src_row.children(".col").each(function (index) {
			const $src = $(this);
			const $dst = $dst_row.children(".col").eq(index);
			if (!$dst.length) {
				return;
			}
			$dst.css({
				position: $src.css("position"),
				left: $src.css("left"),
				zIndex: $src.css("z-index"),
				backgroundColor: "var(--subtle-fg)",
				flex: $src.css("flex"),
				width: $src.css("width"),
				minWidth: $src.css("min-width"),
				maxWidth: $src.css("max-width"),
			});
		});
	}

	collapse_heading_for_sticky($heading, $placeholder, heading_height) {
		// Keep full original heading height in layout via placeholder (label + filter).
		const full_height = Math.round($heading.outerHeight()) || heading_height;
		this._sticky_heading_height = heading_height;
		this._sticky_placeholder_height = full_height;

		$placeholder.css({
			display: "block",
			height: `${full_height}px`,
			width: "100%",
		});
		$heading.addClass("is-page-sticky").css({
			position: "absolute",
			left: 0,
			top: 0,
			width: "100%",
			height: 0,
			margin: 0,
			padding: 0,
			overflow: "hidden",
			opacity: 0,
			pointerEvents: "none",
			visibility: "hidden",
		});
	}

	restore_heading_after_sticky($heading, $placeholder) {
		if ($heading?.length) {
			$heading.removeClass("is-page-sticky").css({
				position: "",
				left: "",
				top: "",
				width: "",
				height: "",
				margin: "",
				padding: "",
				overflow: "",
				opacity: "",
				pointerEvents: "",
				visibility: "",
			});
		}
		if ($placeholder?.length) {
			$placeholder.css({ display: "none", height: "", width: "" });
		}
	}

	clear_page_header_sticky($heading, $placeholder) {
		try {
			this.remove_sticky_header_clone();
			this.restore_heading_after_sticky($heading, $placeholder);
		} catch (e) {
			// Never break form rendering because of sticky cleanup.
			console.warn("enhanced_gridview sticky cleanup failed", e);
		}
	}

	update_page_header_sticky() {
		try {
			this._update_page_header_sticky();
		} catch (e) {
			console.warn("enhanced_gridview sticky update failed", e);
		}
	}

	_update_page_header_sticky() {
		if (this._row_form_open) {
			const $heading = this.wrapper?.find(".form-grid > .grid-heading-row").first();
			const $placeholder = this.wrapper?.find(".enhanced-grid-heading-placeholder");
			this.clear_page_header_sticky($heading, $placeholder);
			return;
		}

		const $heading = this.wrapper?.find(".form-grid > .grid-heading-row").first();
		const $container = this.form_grid_container;
		const $grid_field = this.wrapper;
		if (!$heading?.length || !$container?.length || !$grid_field?.length) {
			return;
		}

		const sticky_top = this.get_page_sticky_top();
		const container_rect = $container[0].getBoundingClientRect();
		const field_rect = $grid_field[0].getBoundingClientRect();
		const heading_height =
			this._sticky_heading_height || Math.round($heading.outerHeight()) || 0;
		const scroll_left = this.get_horizontal_scroll_left();

		let $placeholder = this.wrapper.find(".enhanced-grid-heading-placeholder");
		if (!$placeholder.length) {
			$placeholder = $(
				'<div class="enhanced-grid-heading-placeholder" aria-hidden="true"></div>'
			);
			$heading.after($placeholder);
		}

		const is_stuck = Boolean(this._sticky_header_clone?.length);
		const anchor_top = is_stuck
			? $placeholder[0].getBoundingClientRect().top
			: $heading[0].getBoundingClientRect().top;

		// Keep pinned under tabs until the whole child-table block scrolls away.
		const should_stick =
			anchor_top <= sticky_top && field_rect.bottom > sticky_top + heading_height + 4;

		if (!should_stick) {
			this.clear_page_header_sticky($heading, $placeholder);
			this._sticky_heading_height = null;
			return;
		}

		if (!is_stuck) {
			const $label_row = $heading.children(".grid-row:not(.filter-row)").first();
			this._sticky_heading_height = Math.round($label_row.outerHeight()) || 32;
			this.ensure_sticky_header_clone($heading);
			this.refresh_sticky_header_clone_content($heading);
			// Sync while source heading still has real height/widths, then collapse.
			this.sync_sticky_header_clone(
				$heading,
				this._sticky_header_clone,
				container_rect,
				scroll_left,
				sticky_top
			);
			this.collapse_heading_for_sticky(
				$heading,
				$placeholder,
				this._sticky_heading_height
			);
			return;
		}

		this.sync_sticky_header_clone(
			$heading,
			this._sticky_header_clone,
			container_rect,
			scroll_left,
			sticky_top
		);
	}

	get_scroll_container() {
		return this.form_grid_scroll_area?.length
			? this.form_grid_scroll_area
			: this.form_grid_container;
	}

	get_horizontal_scroll_left() {
		return this.get_scroll_container()?.scrollLeft() || 0;
	}

	set_horizontal_scroll_left(scroll_left) {
		this.get_scroll_container()?.scrollLeft(scroll_left);
	}

	enter_row_form_mode() {
		this._row_form_open = true;

		const $heading = this.wrapper?.find(".form-grid > .grid-heading-row").first();
		const $placeholder = this.wrapper?.find(".enhanced-grid-heading-placeholder");
		this.clear_page_header_sticky($heading, $placeholder);
		this._sticky_heading_height = null;
		this.unpin_grid_link_dropdown();

		this._saved_form_grid_min_width = this.form_grid?.css("min-width") || "";
		this._saved_scroll_left = this.get_horizontal_scroll_left();
		this.set_horizontal_scroll_left(0);

		const container_width = this.form_grid_container?.[0]?.clientWidth || null;
		this.form_grid?.css({
			"min-width": container_width ? `${container_width}px` : "100%",
			"max-width": container_width ? `${container_width}px` : "100%",
			width: container_width ? `${container_width}px` : "100%",
		});
		this.form_grid_container?.addClass("has-open-row-form");
		this.enhanced_scrollbar?.css("display", "none");
		this.enhanced_slider?.css("display", "none");

		// Match standard Frappe: only the open row form is visible in the grid box.
		$heading?.hide();
		$placeholder?.hide();
		this.form_grid?.find(".grid-body .grid-row").not(".grid-row-open").hide();
		this.form_grid?.find(".grid-empty").hide();
	}

	leave_row_form_mode() {
		this._row_form_open = false;
		this.unpin_grid_link_dropdown();
		this.form_grid_container?.removeClass("has-open-row-form");

		this.form_grid?.find(".grid-heading-row").show();
		this.form_grid?.find(".grid-body .grid-row").show();
		this.form_grid
			?.find(".grid-empty")
			.css("display", "")
			.toggleClass("hidden", Boolean(this.data?.length));

		if (this._saved_form_grid_min_width) {
			this.form_grid?.css("min-width", this._saved_form_grid_min_width);
		}
		this.form_grid?.css({
			width: "max-content",
			"max-width": "",
		});
		this._saved_form_grid_min_width = null;

		requestAnimationFrame(() => {
			this.setup_scrollable_width();
			this.set_horizontal_scroll_left(this._saved_scroll_left || 0);
			this._saved_scroll_left = null;
			this.sync_enhanced_slider();
			this.update_page_header_sticky();
		});
	}

	get_awesomplete_dropdown(input_el) {
		if (!input_el) {
			return null;
		}
		const list_id = input_el.getAttribute("aria-owns");
		if (list_id) {
			const by_id = document.getElementById(list_id);
			if (by_id) {
				return by_id;
			}
		}
		return (
			$(input_el).closest(".awesomplete").children("ul, [role='listbox']")[0] ||
			$(input_el).siblings("ul, [role='listbox']")[0] ||
			null
		);
	}

	get_awesomplete_for_input(input_el) {
		if (!input_el) {
			return null;
		}

		const $control = $(input_el).closest(".frappe-control");
		const fieldname =
			$control.attr("data-fieldname") ||
			$(input_el).closest("[data-fieldname]").attr("data-fieldname");
		const grid_row = $(input_el).closest(".grid-row").data("grid_row");

		if (grid_row && fieldname) {
			const field =
				grid_row.on_grid_fields_dict?.[fieldname] ||
				grid_row.grid_form?.fields_dict?.[fieldname];
			if (field?.awesomplete) {
				return field.awesomplete;
			}
		}

		// Fallback: scan open grid rows / form controls that own this input.
		if (grid_row) {
			const dicts = [
				grid_row.on_grid_fields_dict || {},
				grid_row.grid_form?.fields_dict || {},
			];
			for (const dict of dicts) {
				for (const field of Object.values(dict)) {
					if (field?.awesomplete?.input === input_el) {
						return field.awesomplete;
					}
				}
			}
		}

		return null;
	}

	close_open_grid_dropdowns() {
		// Don't steal focus from the standard row editor while it is open.
		if (this._row_form_open) {
			return;
		}
		if (this._pin_pointer_down) {
			return;
		}
		this.unpin_grid_link_dropdown();
		this.wrapper
			?.find(".awesomplete > ul:not([hidden]), .awesomplete > [role='listbox']:not([hidden])")
			.each(function () {
				const input = $(this).siblings("input")[0] || $(this).parent().find("input")[0];
				if (input) {
					$(input).trigger("blur");
				}
			});
		$("body > ul.enhanced-grid-link-dropdown-pinned:not([hidden])").each(function () {
			const input = document.querySelector(`[aria-owns="${this.id}"]`);
			if (input) {
				$(input).trigger("blur");
			}
		});
		this.wrapper?.find("input:focus").trigger("blur");
	}

	bind_pinned_dropdown_selection($dropdown, input_el) {
		const me = this;
		$dropdown.off(".enhanced-grid-pin");

		// Keep input focused so Awesomplete does not close before click selects.
		$dropdown.on("mousedown.enhanced-grid-pin pointerdown.enhanced-grid-pin", (e) => {
			me._pin_pointer_down = true;
			e.preventDefault();
			e.stopPropagation();
		});

		$dropdown.on("mouseup.enhanced-grid-pin pointerup.enhanced-grid-pin", () => {
			setTimeout(() => {
				me._pin_pointer_down = false;
			}, 0);
		});

		// Frappe renders options as div[role=option], not li — handle selection ourselves.
		$dropdown.on("click.enhanced-grid-pin", "[role='option'], li", (e) => {
			e.preventDefault();
			e.stopPropagation();

			const option = e.currentTarget;
			const awesomplete = me.get_awesomplete_for_input(input_el);
			if (!awesomplete) {
				me._pin_pointer_down = false;
				return;
			}

			awesomplete.select(option, option, e.originalEvent || e);
			me._pin_pointer_down = false;
		});

		// Restore keyboard-style highlight on mouse hover.
		$dropdown.on("mouseover.enhanced-grid-pin", "[role='option'], li", function () {
			const awesomplete = me.get_awesomplete_for_input(input_el);
			if (!awesomplete) {
				return;
			}
			const index = Array.prototype.indexOf.call(awesomplete.ul.children, this);
			if (index > -1) {
				awesomplete.goto(index);
			}
		});
	}

	pin_grid_link_dropdown($input) {
		const input_el = $input?.[0];
		const dropdown = this.get_awesomplete_dropdown(input_el);
		if (!dropdown) {
			return;
		}

		const $dropdown = $(dropdown);
		if ($dropdown.data("enhanced-grid-pinned")) {
			this.bind_pinned_dropdown_selection($dropdown, input_el);
			this.reposition_pinned_link_dropdown($input);
			return;
		}

		const $awesomplete = $dropdown.parent(".awesomplete").length
			? $dropdown.parent(".awesomplete")
			: $(input_el).closest(".awesomplete");
		$dropdown.data("enhanced-grid-pin-parent", $awesomplete[0] || dropdown.parentNode);
		document.body.appendChild(dropdown);

		$dropdown.addClass("enhanced-grid-link-dropdown-pinned").data("enhanced-grid-pinned", true);
		this._pinned_link_dropdown = { $input, $dropdown, input_el };
		this.form_grid_container?.addClass("has-open-link-dropdown");
		this.bind_pinned_dropdown_selection($dropdown, input_el);
		this.reposition_pinned_link_dropdown($input);
	}

	reposition_pinned_link_dropdown($input) {
		const input_el = ($input || this._pinned_link_dropdown?.$input)?.[0];
		const dropdown =
			this._pinned_link_dropdown?.$dropdown?.[0] || this.get_awesomplete_dropdown(input_el);
		if (!input_el || !dropdown) {
			return;
		}

		const $dropdown = $(dropdown);
		const input_rect = input_el.getBoundingClientRect();
		const min_width = Math.max(250, Math.round(input_rect.width));
		const width = Math.max(input_rect.width, min_width);
		let left = input_rect.left;
		let top = input_rect.bottom + 2;

		if (left + width > window.innerWidth - 8) {
			left = Math.max(8, input_rect.right - width);
			$dropdown.addClass("awesomplete-align-right");
		} else {
			$dropdown.removeClass("awesomplete-align-right");
		}

		const max_height = Math.min(300, window.innerHeight - top - 12);
		if (max_height < 120 && input_rect.top > 160) {
			top = Math.max(8, input_rect.top - Math.min(300, input_rect.top - 8));
		}

		// Above #freeze.grid-form (1020) and .form-in-grid (1021).
		$dropdown.css({
			position: "fixed",
			top: `${top}px`,
			left: `${left}px`,
			right: "auto",
			width: `${width}px`,
			minWidth: `${min_width}px`,
			maxHeight: `${Math.max(120, max_height)}px`,
			overflowY: "auto",
			zIndex: 1060,
			margin: 0,
			display: "block",
		});
		$dropdown.removeAttr("hidden");
	}

	unpin_grid_link_dropdown($input) {
		if (this._pin_pointer_down) {
			return;
		}

		const input_el = ($input || this._pinned_link_dropdown?.$input)?.[0];
		const dropdown =
			this._pinned_link_dropdown?.$dropdown?.[0] || this.get_awesomplete_dropdown(input_el);

		if (!dropdown) {
			this._pinned_link_dropdown = null;
			this.form_grid_container?.removeClass("has-open-link-dropdown");
			return;
		}

		const $dropdown = $(dropdown);
		if (!$dropdown.data("enhanced-grid-pinned")) {
			this._pinned_link_dropdown = null;
			this.form_grid_container?.removeClass("has-open-link-dropdown");
			return;
		}

		$dropdown.off(".enhanced-grid-pin");

		const parent = $dropdown.data("enhanced-grid-pin-parent");
		if (parent) {
			$(parent).append($dropdown);
		}

		$dropdown
			.removeClass("enhanced-grid-link-dropdown-pinned awesomplete-align-right")
			.css({
				position: "",
				top: "",
				left: "",
				right: "",
				width: "",
				minWidth: "",
				maxHeight: "",
				overflowY: "",
				zIndex: "",
				margin: "",
				display: "",
			})
			.removeData("enhanced-grid-pinned")
			.removeData("enhanced-grid-pin-parent");

		this._pinned_link_dropdown = null;
		this.form_grid_container?.removeClass("has-open-link-dropdown");
	}

	setup_sticky_listeners() {
		if (this._sticky_listeners_setup) {
			return;
		}

		this._sticky_listeners_setup = true;
		const me = this;
		const namespace = `.enhanced-grid-${this.df?.fieldname || this.doctype || "grid"}`;

		this._recalculate_sticky_layout = frappe.utils.debounce(() => {
			const scroll_left = me.get_horizontal_scroll_left();
			me.sync_column_widths();
			me.setup_sticky_columns();
			me.sync_enhanced_slider();
			me.set_horizontal_scroll_left(scroll_left);
			me.update_page_header_sticky();
		}, 100);

		this._on_page_scroll = (event) => {
			const target = event?.target;
			if (
				target?.closest?.(
					".awesomplete > ul, .awesomplete > [role='listbox'], .datepicker, .enhanced-grid-link-dropdown-pinned"
				)
			) {
				return;
			}
			me.close_open_grid_dropdowns();
			if (me._sticky_raf) {
				return;
			}
			me._sticky_raf = window.requestAnimationFrame(() => {
				me._sticky_raf = null;
				me.update_page_header_sticky();
			});
		};

		$(window).on(`resize${namespace}`, this._recalculate_sticky_layout);
		$(window).on(`scroll${namespace}`, this._on_page_scroll);
		document.addEventListener("scroll", this._on_page_scroll, true);
		this.get_scroll_container()?.on("scroll", this._on_page_scroll);
	}

	make() {
		let template = `
			<div class="grid-field enhanced-grid-field">
				<label class="control-label">${__(this.df.label || "")}</label>
				<span class="help"></span>
				<p class="text-muted small grid-description"></p>
				<div class="grid-custom-buttons"></div>
				<div class="form-grid-container enhanced-grid-container">
					<div class="enhanced-grid-scroll-area">
						<div class="form-grid">
							<div class="grid-heading-row"></div>
							<div class="grid-body">
								<div class="rows"></div>
								<div class="grid-empty text-center">
									<img
										src="/assets/frappe/images/ui-states/grid-empty-state.svg"
										alt="Grid Empty State"
										class="grid-empty-illustration"
									>
									${__("No Data")}
								</div>
							</div>
						</div>
					</div>
					<div class="enhanced-scrollbar" aria-hidden="false">
						<input type="range" min="0" max="0" value="0" step="1" class="enhanced-slider">
					</div>
				</div>
				<div class="small form-clickable-section grid-footer">
					<div class="flex justify-between">
						<div class="grid-buttons">
							<button type="button" class="btn btn-xs btn-danger grid-remove-rows hidden"
								data-action="delete_rows">
								${__("Delete")}
							</button>
							<button type="button" class="btn btn-xs btn-danger grid-remove-all-rows hidden"
								data-action="delete_all_rows">
								${__("Delete All")}
							</button>
							<!-- hack to allow firefox include this in tabs -->
							<button type="button" class="btn btn-xs btn-secondary grid-add-row">
								${__("Add Row")}
							</button>
							<button type="button" class="grid-add-multiple-rows btn btn-xs btn-secondary hidden">
								${__("Add Multiple")}</a>
							</button>
						</div>
						<div class="grid-pagination">
						</div>
						<div class="grid-bulk-actions text-right">
							<button type="button" class="grid-download btn btn-xs btn-secondary hidden">
								${__("Download")}
							</button>
							<button type="button" class="grid-upload btn btn-xs btn-secondary hidden">
								${__("Upload")}
							</button>
						</div>
					</div>
				</div>
			</div>
		`;

		this.wrapper = $(template).appendTo(this.parent);
		$(this.parent).addClass("form-group");
		this.set_grid_description();
		this.set_doc_url();

		frappe.utils.bind_actions_with_object(this.wrapper, this);

		this.form_grid = this.wrapper.find(".form-grid");

		this.form_grid_container = this.wrapper.find(".form-grid-container");
		this.form_grid_scroll_area = this.wrapper.find(".enhanced-grid-scroll-area");
		this.enhanced_scrollbar = this.wrapper.find(".enhanced-scrollbar");
		this.enhanced_slider = this.wrapper.find(".enhanced-slider");
		let me = this;
		this.enhanced_slider.on("input", function (event) {
			me.set_horizontal_scroll_left(cint(event.target.value));
		});
		this.get_scroll_container().on("scroll", function () {
			me.close_open_grid_dropdowns();
			me.sync_enhanced_slider_value();
		});
		// Native awesomplete events — document capture is more reliable than jQuery bubble.
		this._on_awesomplete_open = (e) => {
			if (!me.wrapper?.[0]?.contains(e.target)) {
				return;
			}
			me.form_grid_container.addClass("has-open-link-dropdown");
			const $input = $(e.target);
			requestAnimationFrame(() => {
				me.pin_grid_link_dropdown($input);
				requestAnimationFrame(() => me.reposition_pinned_link_dropdown($input));
			});
		};
		this._on_awesomplete_close = (e) => {
			if (me._pin_pointer_down) {
				return;
			}
			if (
				!me.wrapper?.[0]?.contains(e.target) &&
				me._pinned_link_dropdown?.input_el !== e.target
			) {
				return;
			}
			// Let select finish, then restore the list node to its original parent.
			setTimeout(() => me.unpin_grid_link_dropdown($(e.target)), 0);
		};
		document.addEventListener("awesomplete-open", this._on_awesomplete_open, true);
		document.addEventListener("awesomplete-close", this._on_awesomplete_close, true);
		this.wrapper.on("input", "input", (e) => {
			if (me._pinned_link_dropdown?.input_el === e.target) {
				me.reposition_pinned_link_dropdown($(e.target));
			}
		});
		this.setup_sticky_listeners();
		this.setup_add_row();

		this.setup_grid_pagination();

		this.custom_buttons = {};
		this.grid_buttons = this.wrapper.find(".grid-buttons");
		this.grid_custom_buttons = this.wrapper.find(".grid-custom-buttons");
		this.remove_rows_button = this.grid_buttons.find(".grid-remove-rows");
		this.remove_all_rows_button = this.grid_buttons.find(".grid-remove-all-rows");

		this.setup_allow_bulk_edit();
		this.setup_check();
		if (this.df.on_setup) {
			this.df.on_setup(this);
		}


	}

	make_head() {
		if (this.prevent_build) return;

		const $heading = this.wrapper.find(".grid-heading-row");

		// labels
		if (this.header_row) {
			$heading.find(".grid-row").remove();
		}
		// implement custom class
		this.header_row = new Custom_GridRow({
			parent: $heading,
			parent_df: this.df,
			docfields: this.docfields,
			frm: this.frm,
			grid: this,
			configure_columns: true,
		});
		// implement custom class
		this.header_search = new Custom_GridRow({
			parent: $heading,
			parent_df: this.df,
			docfields: this.docfields,
			frm: this.frm,
			grid: this,
			show_search: true,
		});
		this.header_search.row.addClass("filter-row");
		if (this.header_search.show_search || this.header_search.show_search_row()) {
			$heading.addClass("with-filter");
		} else {
			$heading.removeClass("with-filter");
		}

		this.filter_applied && this.update_search_columns();
	}

	refresh() {
		if (this.frm && this.frm.setting_dependency) return;

		const scroll_left = this.get_horizontal_scroll_left();

		this.filter_applied = Object.keys(this.filter).length !== 0;
		this.data = this.get_data(this.filter_applied);

		!this.wrapper && this.make();

		// Drop sticky clone only after wrapper exists.
		this.clear_page_header_sticky(
			this.wrapper.find(".form-grid > .grid-heading-row").first(),
			this.wrapper.find(".enhanced-grid-heading-placeholder")
		);
		this._sticky_heading_height = null;

		let $rows = this.wrapper.find(".rows");

		this.setup_fields();

		if (this.frm) {
			this.display_status = frappe.perm.get_field_display_status(
				this.df,
				this.frm.doc,
				this.perm
			);
		} else if (this.df.is_web_form && this.control) {
			this.display_status = this.control.get_status();
		} else {
			this.display_status = "Write";
		}

		if (this.display_status === "None") return;

		this.make_head();

		if (!this.grid_rows) {
			this.grid_rows = [];
		}

		this.truncate_rows();
		this.grid_rows_by_docname = {};

		this.grid_pagination.update_page_numbers();
		this.render_result_rows($rows, false);
		this.grid_pagination.check_page_number();
		this.wrapper.find(".grid-empty").toggleClass("hidden", Boolean(this.data.length));

		this.setup_toolbar();
		this.toggle_checkboxes(this.display_status !== "Read");

		if (this.is_sortable() && !this.sortable_setup_done) {
			this.make_sortable($rows);
			this.sortable_setup_done = true;
		}

		this.last_display_status = this.display_status;
		this.last_docname = this.frm && this.frm.docname;

		this.form_grid.toggleClass("error", !!(this.df.reqd && !(this.data && this.data.length)));
		this.refresh_remove_rows_button();
		this.wrapper.trigger("change");

		requestAnimationFrame(() => {
			this.sync_column_widths();
			this.setup_sticky_columns();
			this.set_horizontal_scroll_left(scroll_left);
			this.update_page_header_sticky();
		});
	}

	render_result_rows($rows, append_row) {
		let result_length = this.grid_pagination.get_result_length();
		let page_index = this.grid_pagination.page_index;
		let page_length = this.grid_pagination.page_length;
		if (!this.grid_rows) {
			return;
		}
		for (var ri = (page_index - 1) * page_length; ri < result_length; ri++) {
			var d = this.data[ri];
			if (!d) {
				return;
			}
			if (d.idx === undefined) {
				d.idx = ri + 1;
			}
			if (d.name === undefined) {
				d.name = "row " + d.idx;
			}
			let grid_row;
			if (this.grid_rows[ri] && !append_row) {
				grid_row = this.grid_rows[ri];
				grid_row.doc = d;
				grid_row.refresh();
			} else {
				// implement custom class
				grid_row = new Custom_GridRow({
					parent: $rows,
					parent_df: this.df,
					docfields: this.docfields,
					doc: d,
					frm: this.frm,
					grid: this,
				});
				this.grid_rows[ri] = grid_row;
			}

			this.grid_rows_by_docname[d.name] = grid_row;
		}
	}

	setup_visible_columns() {
		if (this.visible_columns && this.visible_columns.length > 0) return;

		this.user_defined_columns = [];
		this.setup_user_defined_columns();
		var total_colsize = 1,
			fields =
				this.user_defined_columns && this.user_defined_columns.length > 0
					? this.user_defined_columns
					: this.editable_fields || this.docfields;

		this.visible_columns = [];

		for (var ci in fields) {
			var _df = fields[ci];

			// get docfield if from fieldname
			df =
				this.user_defined_columns && this.user_defined_columns.length > 0
					? _df
					: this.fields_map[_df.fieldname];

			if (
				df &&
				!df.hidden &&
				(this.editable_fields || df.in_list_view) &&
				((this.frm && this.frm.get_perm(df.permlevel, "read")) || !this.frm) &&
				!frappe.model.layout_fields.includes(df.fieldtype)
			) {
				if (df.columns) {
					df.colsize = df.columns;
				} else {
					this.update_default_colsize(df);
				}

				// attach formatter on refresh
				if (
					df.fieldtype == "Link" &&
					!df.formatter &&
					df.parent &&
					frappe.meta.docfield_map[df.parent]
				) {
					const docfield = frappe.meta.docfield_map[df.parent][df.fieldname];
					if (docfield && docfield.formatter) {
						df.formatter = docfield.formatter;
					}
				}

				total_colsize += df.colsize;
				if (total_colsize > 100) return false; // Increased limit to 20
				this.visible_columns.push([df, df.colsize]);
			}

		}

		// redistribute if total-col size is less than 12
		var passes = 0;
		while (total_colsize < 11 && passes < 12) { // Adjusted loop conditions
			for (var i in this.visible_columns) {
				var df = this.visible_columns[i][0];
				var colsize = this.visible_columns[i][1];
				if (colsize > 1 && colsize < 11 && frappe.model.is_non_std_field(df.fieldname)) {
					if (
						passes < 3 &&
						["Int", "Currency", "Float", "Check", "Percent"].indexOf(df.fieldtype) !==
						-1
					) {
						// don't increase col size of these fields in first 3 passes
						continue;
					}

					this.visible_columns[i][1] += 1;
					total_colsize++;
				}

				if (total_colsize > 10) break;
			}
			passes++;
		}

		// set width of scrollable area
		this.setup_scrollable_width();
		this.verify_overflow_columns_width();
	}


	setup_scrollable_width() {
		if (!this.form_grid_container?.[0] || this._row_form_open) {
			return;
		}

		let width = 200;
		this.visible_columns.forEach((column) => {
			width += this.get_column_width(column[1]);
		});

		this.form_grid.css({
			"min-width": `${width}px`,
			width: "max-content",
		});

		requestAnimationFrame(() => {
			this.sync_column_widths();
			this.setup_sticky_columns();
			this.sync_enhanced_slider();
			this.update_page_header_sticky();
		});
	}

	get_max_horizontal_scroll() {
		const el = this.get_scroll_container()?.[0];
		if (!el) {
			return 0;
		}
		return Math.max(0, el.scrollWidth - el.clientWidth);
	}

	sync_enhanced_slider_value() {
		if (!this.enhanced_slider?.length || this._row_form_open) {
			return;
		}
		const max_scroll = this.get_max_horizontal_scroll();
		if (max_scroll <= 0) {
			return;
		}
		const scroll_left = Math.min(this.get_horizontal_scroll_left(), max_scroll);
		this.enhanced_slider.val(scroll_left);
	}

	sync_enhanced_slider() {
		if (!this.enhanced_slider?.length || this._row_form_open) {
			return;
		}

		const el = this.get_scroll_container()?.[0];
		if (!el) {
			return;
		}

		const max_scroll = Math.max(0, el.scrollWidth - el.clientWidth);
		if (max_scroll <= 0) {
			this.enhanced_scrollbar?.css("display", "none");
			this.enhanced_slider.css("display", "none").val(0).attr("max", 0);
			return;
		}

		const thumb_pct = Math.min(
			100,
			Math.max(10, (el.clientWidth / Math.max(el.scrollWidth, 1)) * 100)
		);
		const scroll_left = Math.min(el.scrollLeft || 0, max_scroll);

		this.enhanced_scrollbar?.css("display", "block");
		this.enhanced_slider
			.attr({ min: 0, max: max_scroll, step: 1 })
			.val(scroll_left)
			.css({
				display: "block",
				"--thumb-size": `${thumb_pct}%`,
			});
	}

	verify_overflow_columns_width() {
		if (!this.form_grid_container?.[0] || this._row_form_open) {
			return;
		}

		const max_scroll = this.get_max_horizontal_scroll();
		if (max_scroll > 0) {
			this.form_grid_container.addClass("enhanced-grid-container");
			this.sync_enhanced_slider();
		} else {
			this.enhanced_scrollbar?.css("display", "none");
			this.enhanced_slider.css("display", "none").val(0);
		}
	}

}


frappe.ui.form.ControlTable = class CustomControlTable extends frappe.ui.form.ControlTable {
	make() {
		super.make();

		// Replace default Grid markup so sticky header binds to the visible table only.
		if (this.grid?.wrapper?.length) {
			this.grid.wrapper.remove();
		}

		this.grid = new Custom_Grid({
			frm: this.frm,
			df: this.df,
			parent: this.wrapper,
			control: this,
		});
	}
}

