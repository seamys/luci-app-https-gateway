'use strict';
'require view';
'require uci';
'require rpc';
'require poll';
'require form';
'require fs';

var callStatus = rpc.declare({ object: 'https-gateway', method: 'status' });
var callNginxTest = rpc.declare({ object: 'https-gateway', method: 'nginx_test' });
var callCertIssue = rpc.declare({ object: 'https-gateway', method: 'cert_issue' });
var callCertStatus = rpc.declare({ object: 'https-gateway', method: 'cert_status' });

function badge(text, color) {
	return E('span', {
		'style': 'display:inline-block;padding:2px 10px;border-radius:10px;color:#fff;font-weight:bold;background:' + color
	}, text);
}

function renderStatus(st) {
	st = st || {};

	var nginxBadge = st.nginx_running
		? badge(_('Running'), '#2e7d32')
		: badge(_('Stopped'), '#c62828');

	var certRows = [];
	if (st.certificates && st.certificates.length) {
		st.certificates.forEach(function(cert) {
			var statusBadge;
			if (cert.status === 'valid')
				statusBadge = badge(_('Valid'), '#2e7d32');
			else if (cert.status === 'pending')
				statusBadge = badge(_('Pending'), '#f57c00');
			else
				statusBadge = badge(cert.status || _('Unknown'), '#888');

			certRows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, cert.domain || '\u2014'),
				E('td', { 'class': 'td' }, statusBadge),
				E('td', { 'class': 'td' }, cert.expires || '\u2014'),
				E('td', { 'class': 'td' }, cert.key_type || '\u2014')
			]));
		});
	} else {
		certRows.push(E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'colspan': '4' }, _('No certificates configured'))
		]));
	}

	return E('div', {}, [
		E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'width': '33%' }, E('strong', {}, _('nginx Status'))),
				E('td', { 'class': 'td left' }, nginxBadge)
			]),
			E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left' }, E('strong', {}, _('Proxy Rules'))),
				E('td', { 'class': 'td left' }, String(st.proxy_count || 0))
			])
		]),
		E('h4', {}, _('Certificate Status')),
		E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr cbi-section-table-titles' }, [
				E('th', { 'class': 'th' }, _('Domain')),
				E('th', { 'class': 'th' }, _('Status')),
				E('th', { 'class': 'th' }, _('Expires')),
				E('th', { 'class': 'th' }, _('Key Type'))
			])
		].concat(certRows))
	]);
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('https_gateway'),
			callStatus().catch(function() { return {}; })
		]);
	},

	render: function(data) {
		var initialStatus = data[1] || {};
		var statusBox = E('div', {}, renderStatus(initialStatus));

		poll.add(function() {
			return callStatus().then(function(st) {
				var fresh = renderStatus(st);
				statusBox.innerHTML = '';
				statusBox.appendChild(fresh);
			});
		}, 5);

		var issueBox = E('div', { 'id': 'issue-status' }, '');

		var btnTest = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': function() {
				callNginxTest().then(function(res) {
					if (res && res.valid)
						alert(_('nginx configuration test passed'));
					else
						alert(_('nginx configuration error: ') + (res && res.message || _('Unknown')));
				});
			}
		}, _('Test nginx Config'));

		var btnIssue = E('button', {
			'class': 'btn cbi-button cbi-button-positive',
			'click': function() {
				if (!confirm(_('Issue/renew all certificates? This may take 3-5 minutes.')))
					return;
				callCertIssue().then(function() {
					issueBox.innerText = _('Certificate issuance started...');
					var pollId = setInterval(function() {
						callCertStatus().then(function(st) {
							if (st.state === 'running') {
								issueBox.innerText = _('Issuing certificates...') + ' ' + (st.log || '').replace(/\|/g, '\n');
							} else {
								issueBox.innerText = _('Certificate issuance completed.') + ' ' + (st.log || '').replace(/\|/g, '\n');
								clearInterval(pollId);
							}
						});
					}, 5000);
				});
			}
		}, _('Issue/Renew Certificates'));

		var btnReload = E('button', {
			'class': 'btn cbi-button cbi-button-apply',
			'click': function() {
				return fs.exec('/etc/init.d/https_gateway', ['reload']).then(function() {
					alert(_('Configuration reloaded'));
				});
			}
		}, _('Reload Configuration'));

		var m, s, o;
		m = new form.Map('https_gateway', _('HTTPS Gateway - Global Settings'),
			_('LAN HTTPS reverse proxy gateway — manage ACME certificates, nginx virtual hosts, and local DNS resolution in one place.'));

		s = m.section(form.NamedSection, 'global', 'gateway', _('General Settings'));
		s.anonymous = true;

		o = s.option(form.Flag, 'enabled', _('Enable Gateway'),
			_('When disabled, the proxy service stops and uhttpd reverts to default ports.'));
		o.rmempty = false;

		o = s.option(form.Value, 'email', _('ACME Email'),
			_("Let's Encrypt account email for certificate expiry notifications."));
		o.datatype = 'email';

		o = s.option(form.ListValue, 'dns_provider', _('DNS Provider'),
			_('DNS API provider used for DNS-01 challenge validation.'));
		o.value('dns_ali', _('Alibaba Cloud DNS (dns_ali)'));
		o.value('dns_cf', _('Cloudflare (dns_cf)'));
		o.value('dns_dp', _('Tencent DNSPod (dns_dp)'));
		o.value('dns_gd', _('GoDaddy (dns_gd)'));

		o = s.option(form.DynamicList, 'credentials', _('DNS API Credentials'),
			_('Format: Key="Value". Example: Ali_Key="LTAI...", Ali_Secret="..."'));
		o.password = true;

		o = s.option(form.Value, 'dns_wait', _('DNS Propagation Wait (seconds)'),
			_('Time to wait for DNS TXT record propagation. Recommended: 180-300.'));
		o.datatype = 'uinteger';
		o.placeholder = '180';

		o = s.option(form.Flag, 'use_staging', _('Use Staging Environment'),
			_("Use Let's Encrypt Staging for testing. Certificates will not be trusted by browsers."));

		o = s.option(form.Flag, 'auto_dns', _('Automatic Local DNS'),
			_('Automatically add domain to router IP mappings in dnsmasq.'));
		o.default = '1';

		return m.render().then(function(mapNode) {
			return E([], [
				E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Service Status')),
					statusBox,
					E('div', { 'style': 'margin-top:1em;display:flex;gap:0.5em;flex-wrap:wrap' }, [
						btnTest, btnIssue, btnReload
					]),
					issueBox
				]),
				mapNode
			]);
		});
	}
});
