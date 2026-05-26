'use strict';
'require view';
'require form';
'require uci';

return view.extend({
	load: function() {
		return uci.load('https_gateway');
	},

	render: function() {
		var m, s, o;

		m = new form.Map('https_gateway', _('HTTPS Gateway - Certificates'),
			_('Manage TLS certificates. Supports individual domains and wildcards (*.example.com). ' +
			  'A wildcard certificate covers all subdomains without individual issuance.'));

		s = m.section(form.TypedSection, 'certificate', _('Certificate List'));
		s.anonymous = false;
		s.addremove = true;
		s.addbtntitle = _('Add Certificate');

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.rmempty = false;
		o.default = '1';

		o = s.option(form.Value, 'domain', _('Domain'),
			_('Enter a full domain (e.g. nas.example.com) or wildcard (e.g. *.example.com). ' +
			  'Wildcard certificates also cover the base domain.'));
		o.rmempty = false;
		o.validate = function(section_id, value) {
			if (!value)
				return _('Domain cannot be empty');
			if (!/^\*?\\.?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value))
				return _('Invalid domain format. Example: sub.example.com or *.example.com');
			return true;
		};

		o = s.option(form.ListValue, 'key_type', _('Key Type'),
			_('EC 256 is faster and smaller; RSA 2048 has better compatibility.'));
		o.value('ec256', _('EC 256 (Recommended)'));
		o.value('ec384', 'EC 384');
		o.value('rsa2048', 'RSA 2048');
		o.value('rsa4096', 'RSA 4096');
		o.default = 'ec256';

		return m.render();
	}
});
