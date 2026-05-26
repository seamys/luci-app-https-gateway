'use strict';
'require view';
'require form';
'require uci';
'require rpc';

var callStatus = rpc.declare({ object: 'https-gateway', method: 'status' });

function badge(text, color) {
	return E('span', {
		'style': 'display:inline-block;padding:2px 8px;border-radius:10px;' +
		         'color:#fff;font-weight:bold;font-size:0.85em;background:' + color
	}, text);
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('https_gateway'),
			callStatus().catch(function() { return {}; })
		]);
	},

	render: function(data) {
		var st = data[1] || {};
		var certStatusMap = {};
		(st.certificates || []).forEach(function(c) {
			certStatusMap[c.domain] = c;
		});

		/* ── Status summary bar ────────────────────────────── */
		var validCount   = 0;
		var pendingCount = 0;
		var unknownCount = 0;
		(st.certificates || []).forEach(function(c) {
			if (c.status === 'valid')        validCount++;
			else if (c.status === 'pending') pendingCount++;
			else                             unknownCount++;
		});

		var summaryParts = [];
		if (validCount)   summaryParts.push(badge(validCount + ' ' + _('Valid'), '#2e7d32'));
		if (pendingCount) summaryParts.push(badge(pendingCount + ' ' + _('Pending'), '#f57c00'));
		if (unknownCount) summaryParts.push(badge(unknownCount + ' ' + _('Unknown'), '#888'));

		var summaryNote = E('div', {
			'style': 'margin-bottom:1em;padding:8px 12px;background:#f5f5f5;' +
			         'border-radius:4px;display:flex;align-items:center;gap:0.75em;flex-wrap:wrap'
		}, (summaryParts.length ? summaryParts : [
			E('span', { 'style': 'color:#888' }, _('No certificates configured yet.'))
		]).concat([
			E('span', { 'style': 'margin-left:auto;font-size:0.85em;color:#555' }, [
				_('To issue or renew certificates, go to '),
				E('a', { 'href': L.url('admin/services/https-gateway/overview') },
				  _('Dashboard') + ' \u2192 ' + _('Quick Actions'))
			])
		]));

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
		o.value('ec384', _('EC 384'));
		o.value('rsa2048', _('RSA 2048'));
		o.value('rsa4096', _('RSA 4096'));
		o.default = 'ec256';

		return m.render().then(function(formNode) {
			/* Inject a live status badge next to each cert's domain in the form */
			var sections = uci.sections('https_gateway', 'certificate');
			sections.forEach(function(sect) {
				var domain = sect.domain;
				if (!domain) return;
				var info = certStatusMap[domain];
				if (!info) return;

				var statusBadge;
				if (info.status === 'valid')
					statusBadge = badge(_('Valid'), '#2e7d32');
				else if (info.status === 'pending')
					statusBadge = badge(_('Pending'), '#f57c00');
				else
					statusBadge = badge(info.status || _('Unknown'), '#888');

				var expiryText = info.expires
					? E('span', { 'style': 'font-size:0.8em;color:#555;margin-left:6px' },
					    _('expires') + ': ' + info.expires)
					: null;

				var indicator = E('div', { 'style': 'margin-top:4px;display:flex;align-items:center;gap:4px' },
					expiryText ? [statusBadge, expiryText] : [statusBadge]);

				/* Find the domain field row for this section */
				var domainRow = formNode.querySelector(
					'[id="cbi-https_gateway-' + sect['.name'] + '-domain"]');
				if (domainRow) domainRow.appendChild(indicator);
			});

			return E([], [summaryNote, formNode]);
		});
	}
});
