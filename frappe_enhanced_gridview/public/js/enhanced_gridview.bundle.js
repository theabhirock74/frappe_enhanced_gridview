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
		super.show_form()

		$(this.grid.form_grid).removeClass("relative-important");
	}
	hide_form() {
		super.hide_form()

		$(this.grid.form_grid).addClass("relative-important");
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
			zIndex: 1025,
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
		const scroll_left = $container.scrollLeft() || 0;

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

	setup_sticky_listeners() {
		if (this._sticky_listeners_setup) {
			return;
		}

		this._sticky_listeners_setup = true;
		const me = this;
		const namespace = `.enhanced-grid-${this.df?.fieldname || this.doctype || "grid"}`;

		this._recalculate_sticky_layout = frappe.utils.debounce(() => {
			const scroll_left = me.form_grid_container?.scrollLeft() || 0;
			me.sync_column_widths();
			me.setup_sticky_columns();
			me.form_grid_container?.scrollLeft(scroll_left);
			me.update_page_header_sticky();
		}, 100);

		this._on_page_scroll = () => {
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
		this.form_grid_container.on("scroll", this._on_page_scroll);
	}

	make() {
		let template = `
			<div class="grid-field enhanced-grid-field">
				<label class="control-label">${__(this.df.label || "")}</label>
				<span class="help"></span>
				<p class="text-muted small grid-description"></p>
				<div class="grid-custom-buttons"></div>
				<div class="form-grid-container enhanced-grid-container">
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
					<input type="range" min="0" max="100" value="0" class="enhanced-slider">
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
		this.enhanced_slider = this.wrapper.find(".enhanced-slider");
		let me = this;
		this.enhanced_slider.on("input", function (event) {
			me.form_grid_container.scrollLeft(cint(event.target.value));
		});
		this.form_grid_container.on(
			"scroll",
			frappe.utils.debounce(function () {
				me.enhanced_slider.val(me.form_grid_container.scrollLeft());
			}, 10)
		);
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

		const scroll_left = this.form_grid_container?.scrollLeft() || 0;

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
			this.form_grid_container?.scrollLeft(scroll_left);
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
		if (!this.form_grid_container?.[0]) {
			return;
		}

		let width = 200;
		this.visible_columns.forEach((column) => {
			width += this.get_column_width(column[1]);
		});
		const container_width = this.form_grid_container[0].clientWidth;
		const scroll_width = Math.max(width - container_width, 0);
		const scroll_left = this.form_grid_container.scrollLeft();

		this.form_grid.css("min-width", `${width}px`);

		if (scroll_width > 0) {
			this.enhanced_slider.prop("max", scroll_width);
			this.enhanced_slider.prop("style", "display:block");
			this.form_grid_container.scrollLeft(Math.min(scroll_left, scroll_width));
		} else {
			this.form_grid_container.scrollLeft(0);
			this.enhanced_slider.prop("max", 0);
			this.enhanced_slider.prop("style", "display:none");
			this.enhanced_slider.prop("value", 0);
		}

		requestAnimationFrame(() => {
			this.sync_column_widths();
			this.setup_sticky_columns();
			this.update_page_header_sticky();
		});
	}

	verify_overflow_columns_width() {
		if (!this.form_grid_container?.[0]) {
			return;
		}

		let width = 200;
		this.visible_columns.forEach((column) => {
			width += column[1] * 50 + 100;
		});

		if (width > this.form_grid_container[0].clientWidth) {
			this.form_grid_container.addClass("enhanced-grid-container");
			this.enhanced_slider.prop("style", "display:block");
		} else {
			this.enhanced_slider.prop("style", "display:none");
			this.enhanced_slider.prop("value", 0);
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

