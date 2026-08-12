import frappe
import frappe.custom.doctype.customize_form.customize_form as customize_form_module

PROPERTY_SETTER_ONLY_FIELDS = frozenset({"sticky_in_grid"})


def _patch_customize_form():
	"""Register sticky_in_grid for Customize Form and avoid querying tabDocField."""
	if "sticky_in_grid" not in customize_form_module.docfield_properties:
		customize_form_module.docfield_properties["sticky_in_grid"] = "Check"

	if getattr(customize_form_module.CustomizeForm, "_sticky_grid_patched", False):
		return

	original_get_existing_property_value = (
		customize_form_module.CustomizeForm.get_existing_property_value
	)

	def get_existing_property_value(self, property_name, fieldname=None):
		# sticky_in_grid is not a DocField DB column — read/compare via Property Setter.
		if (
			fieldname
			and property_name in PROPERTY_SETTER_ONLY_FIELDS
			and not frappe.db.has_column("DocField", property_name)
		):
			return frappe.db.get_value(
				"Property Setter",
				{
					"doc_type": self.doc_type,
					"doctype_or_field": "DocField",
					"field_name": fieldname,
					"property": property_name,
				},
				"value",
			)

		return original_get_existing_property_value(self, property_name, fieldname)

	customize_form_module.CustomizeForm.get_existing_property_value = (
		get_existing_property_value
	)
	customize_form_module.CustomizeForm._sticky_grid_patched = True


_patch_customize_form()
