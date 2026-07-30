import GridRow from './grid_row';
import Grid from './grid';

// A wheel gesture (trackpad flick / mouse wheel spin) fires a burst of events. We track the
// burst globally so a grid only steals a plain vertical wheel when the gesture *started* over
// it, instead of trapping a page scroll that merely passes over the grid.
const WHEEL_GESTURE = { last_time: 0, fresh: true, owner: null };
const WHEEL_GESTURE_GAP = 200;
let wheel_tracker_bound = false;

function bind_wheel_gesture_tracker() {
	if (wheel_tracker_bound) return;
	wheel_tracker_bound = true;

	document.addEventListener(
		"wheel",
		() => {
			let now = Date.now();
			WHEEL_GESTURE.fresh = now - WHEEL_GESTURE.last_time > WHEEL_GESTURE_GAP;
			if (WHEEL_GESTURE.fresh) {
				WHEEL_GESTURE.owner = null;
			}
			WHEEL_GESTURE.last_time = now;
		},
		{ capture: true, passive: true }
	);
}

function claim_wheel_gesture(owner) {
	if (WHEEL_GESTURE.owner === owner) return true;
	if (WHEEL_GESTURE.owner || !WHEEL_GESTURE.fresh) return false;
	WHEEL_GESTURE.owner = owner;
	return true;
}

function release_wheel_gesture(owner) {
	if (WHEEL_GESTURE.owner === owner) {
		WHEEL_GESTURE.owner = "page";
	}
}

// elements that own the pointer themselves - dragging on them must not pan the grid
const NO_DRAG_SCROLL = [
	"input",
	"select",
	"textarea",
	"button",
	"a",
	"[contenteditable='true']",
	".sortable-handle",
	".grid-insert-row",
	".grid-insert-row-below",
	".grid-duplicate-row",
	".grid-delete-row",
].join(", ");

class Custom_GridRow extends GridRow {

	validate_columns_width() {
		let total_column_width = 0.0;

		this.selected_columns_for_grid.forEach((row) => {
			if (row.columns && row.columns > 0) {
				total_column_width += cint(row.columns);
			}
		});

		// if (total_column_width && total_column_width > 10) {
		// 	frappe.throw(__("The total column width cannot be more than 10."));
		// }
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

	make() {
		let template = `
			<div class="grid-field">
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


		// enhance slider changes
		this.form_grid.addClass("relative-important");
		this.form_grid_container = this.wrapper.find(".form-grid-container");
		this.enhanced_slider = this.wrapper.find(".enhanced-slider");
		this.scroll_offset = 0;

		this.enhanced_slider.on("input", (event) => {
			this.set_scroll_offset(parseFloat(event.target.value));
		});

		this.setup_horizontal_scroll();


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

		// labels
		if (this.header_row) {
			$(this.parent).find(".grid-heading-row .grid-row").remove();
		}
		// implement custom class
		this.header_row = new Custom_GridRow({
			parent: $(this.parent).find(".grid-heading-row"),
			parent_df: this.df,
			docfields: this.docfields,
			frm: this.frm,
			grid: this,
			configure_columns: true,
		});
		// implement custom class
		this.header_search = new Custom_GridRow({
			parent: $(this.parent).find(".grid-heading-row"),
			parent_df: this.df,
			docfields: this.docfields,
			frm: this.frm,
			grid: this,
			show_search: true,
		});
		this.header_search.row.addClass("filter-row");
		if (this.header_search.show_search || this.header_search.show_search_row()) {
			$(this.parent).find(".grid-heading-row").addClass("with-filter");
		} else {
			$(this.parent).find(".grid-heading-row").removeClass("with-filter");
		}

		this.filter_applied && this.update_search_columns();
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
		this.setup_scrollable_width()
		this.verify_overflow_columns_width()
	}


	get_grid_width() {
		let width = 200;
		(this.visible_columns || []).forEach(column => {
			width += column[1] * 50 + 100
		});
		return width;
	}

	get_max_scroll_offset() {
		if (!this.form_grid_container || !this.form_grid_container[0]) return 0;
		return Math.max(this.get_grid_width() - this.form_grid_container[0].clientWidth, 0);
	}

	// while a row is expanded into its form the grid is not offset, so panning is meaningless
	is_scrollable() {
		return this.form_grid.hasClass("relative-important") && this.get_max_scroll_offset() > 0;
	}

	set_scroll_offset(value) {
		let max = this.get_max_scroll_offset();
		let offset = Math.min(Math.max(value || 0, 0), max);

		this.scroll_offset = offset;
		this.form_grid.css("left", `-${offset}px`);
		this.enhanced_slider.val(offset);
		return offset;
	}

	setup_scrollable_width() {
		if (!this.form_grid_container || !this.form_grid_container[0]) return;

		let max = this.get_max_scroll_offset();
		this.enhanced_slider.prop("max", max || this.form_grid_container[0].clientWidth);
		this.enhanced_slider.toggle(max > 0);
		this.set_scroll_offset(max > 0 ? this.scroll_offset : 0);
	}

	verify_overflow_columns_width() {
		if (!this.form_grid_container || !this.form_grid_container[0]) return;

		if (this.get_max_scroll_offset() > 0) {
			this.form_grid_container.addClass('enhanced-grid-container')
		}
	}

	setup_horizontal_scroll() {
		let container = this.form_grid_container && this.form_grid_container[0];
		if (!container) return;

		bind_wheel_gesture_tracker();

		container.addEventListener("wheel", (e) => this.on_wheel(e), { passive: false });
		this.setup_drag_scroll(container);

		// keep the field reachable when it is tabbed into from outside the visible area
		this.form_grid_container.on("focusin", (e) => this.scroll_into_view(e.target));

		if (window.ResizeObserver) {
			let observer = new ResizeObserver(
				frappe.utils.debounce(() => this.setup_scrollable_width(), 100)
			);
			observer.observe(container);
		}
	}

	on_wheel(e) {
		if (!this.is_scrollable()) return;

		let is_horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
		let delta = is_horizontal ? e.deltaX : e.deltaY;
		if (!delta) return;

		// a plain vertical wheel only pans the grid when the gesture began here,
		// so an ongoing page scroll passing over the grid is left alone
		if (!is_horizontal && !e.shiftKey && !claim_wheel_gesture(this)) return;

		if (e.deltaMode === 1) {
			delta *= 16;
		} else if (e.deltaMode === 2) {
			delta *= this.form_grid_container[0].clientWidth;
		}

		let current = this.scroll_offset || 0;
		if (this.set_scroll_offset(current + delta) === current) {
			// hit either edge, hand the gesture back to the page
			release_wheel_gesture(this);
			return;
		}

		e.preventDefault();
	}

	setup_drag_scroll(container) {
		let start_x = 0;
		let start_offset = 0;
		let pointer_id = null;
		let dragging = false;
		let drag_completed = false;

		container.addEventListener("pointerdown", (e) => {
			drag_completed = false;
			if (e.pointerType === "mouse" && e.button !== 0) return;
			if (!this.is_scrollable()) return;
			if (e.target.closest && e.target.closest(NO_DRAG_SCROLL)) return;

			start_x = e.clientX;
			start_offset = this.scroll_offset || 0;
			pointer_id = e.pointerId;
			dragging = false;
		});

		container.addEventListener("pointermove", (e) => {
			if (pointer_id !== e.pointerId) return;

			let diff = start_x - e.clientX;
			if (!dragging) {
				if (Math.abs(diff) < 5) return;
				dragging = true;
				this.form_grid_container.addClass("is-dragging");
				container.setPointerCapture && container.setPointerCapture(pointer_id);
			}

			e.preventDefault();
			this.set_scroll_offset(start_offset + diff);
		});

		let end_drag = (e) => {
			if (pointer_id !== e.pointerId) return;
			if (dragging) {
				this.form_grid_container.removeClass("is-dragging");
				container.releasePointerCapture && container.releasePointerCapture(pointer_id);
				drag_completed = true;
			}
			pointer_id = null;
			dragging = false;
		};

		container.addEventListener("pointerup", end_drag);
		container.addEventListener("pointercancel", end_drag);

		// a pan ends with a click on whatever cell the pointer landed on - drop it
		container.addEventListener(
			"click",
			(e) => {
				if (!drag_completed) return;
				drag_completed = false;
				e.preventDefault();
				e.stopPropagation();
			},
			true
		);
	}

	scroll_into_view(element) {
		if (!element || !this.is_scrollable()) return;

		let container_rect = this.form_grid_container[0].getBoundingClientRect();
		let rect = element.getBoundingClientRect();
		if (!rect.width && !rect.height) return;

		let padding = 20;
		let offset = this.scroll_offset || 0;

		if (rect.right > container_rect.right - padding) {
			offset += rect.right - container_rect.right + padding;
		} else if (rect.left < container_rect.left + padding) {
			offset -= container_rect.left + padding - rect.left;
		} else {
			return;
		}

		this.set_scroll_offset(offset);
	}

}


frappe.ui.form.ControlTable = class CustomControlTable extends frappe.ui.form.ControlTable {
	make() {
		super.make();

		// add title if prev field is not column / section heading or html
		this.grid = new Custom_Grid({
			frm: this.frm,
			df: this.df,
			parent: this.wrapper,
			control: this,
		});

	}



}

