import frappe


def execute():
	"""Remove broken DocField-sticky_in_grid custom field if it exists.

	sticky_in_grid must live on Customize Form Field + Property Setter only,
	not as a column on tabDocField.
	"""
	name = "DocField-sticky_in_grid"
	if frappe.db.exists("Custom Field", name):
		frappe.delete_doc("Custom Field", name, force=True, ignore_permissions=True)
