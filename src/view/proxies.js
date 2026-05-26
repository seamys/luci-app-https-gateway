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

		m = new form.Map('https_gateway', _('HTTPS Gateway - Proxy Rules'),
			_('Configure reverse proxy rules. Each rule maps a domain + path to a backend service, with HTTP and WebSocket support.'));

		s = m.section(form.TypedSection, 'proxy', _('Proxy Rules'));
		s.anonymous = false;
		s.addremove = true;
		s.addbtntitle = _('Add Proxy Rule');
		s.sortable = true;

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.rmempty = false;
		o.default = '1';

		o = s.option(form.Value, 'name', _('Name'),
			_('A friendly name for this rule, e.g. "NAS WebUI", "Home Assistant".'));
		o.placeholder = 'My Service';

		o = s.option(form.Value, 'domain', _('Domain'),
			_('Domain for this rule (must be covered by a configured certificate).'));
		o.rmempty = false;
		o.validate = function(section_id, value) {
			if (!value)
				return _('Domain cannot be empty');
			if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value))
				return _('Enter a valid domain (no wildcards), e.g. nas.example.com');
			return true;
		};

		o = s.option(form.Value, 'location', _('Path'),
			_('URL path prefix, e.g. / or /api/. Paths under the same domain must be unique.'));
		o.rmempty = false;
		o.default = '/';
		o.validate = function(section_id, value) {
			if (!value || !/^\/[a-zA-Z0-9_./-]*$/.test(value))
				return _('Path must start with / and contain only letters, digits, _, ., -, /');
			return true;
		};

		o = s.option(form.Value, 'upstream', _('Upstream'),
			_('Backend service address, e.g. http://192.168.0.100:5000 or http://127.0.0.1:8080'));
		o.rmempty = false;
		o.placeholder = 'http://192.168.0.x:port';
		o.validate = function(section_id, value) {
			if (!value)
				return _('Upstream address cannot be empty');
			if (!/^https?:\/\/[a-zA-Z0-9.:\[\]-]+(\/[^\s]*)?$/.test(value))
				return _('Enter a valid HTTP/HTTPS address');
			return true;
		};

		o = s.option(form.Flag, 'websocket', _('WebSocket'),
			_('Enable Upgrade/Connection headers for WebSocket long-lived connections.'));
		o.default = '0';

		return m.render();
	}
});
