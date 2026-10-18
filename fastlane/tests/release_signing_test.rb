require 'minitest/autorun'

class ReleaseSigningTest < Minitest::Test
  def signing_calls(mapping)
    source = File.read(File.expand_path('../Fastfile', __dir__))
    body = source.split('  private_lane :apply_app_store_signing do |options|', 2).last.split('  # ── Lanes', 2).first
    body = body.sub(/\n  end\s*\z/, '')
    harness = Object.new
    calls = []
    harness.define_singleton_method(:is_ci) { true }
    harness.define_singleton_method(:lane_context) { { SharedValues::MATCH_PROVISIONING_PROFILE_MAPPING => mapping } }
    harness.define_singleton_method(:update_code_signing_settings) { |**args| calls << args }
    harness.instance_eval("proc do |options|; #{body}; end").call({})
    calls
  end

  def test_each_target_receives_its_own_distribution_profile
    calls = signing_calls(APP_IDENTIFIER => 'main-profile', "#{APP_IDENTIFIER}.LiveActivity" => 'extension-profile')
    assert_equal [[SCHEME], ['NSMarksLiveActivity']], calls.map { |call| call[:targets] }
    assert_equal ['main-profile', 'extension-profile'], calls.map { |call| call[:profile_name] }
    assert calls.all? { |call| call[:code_sign_identity] == 'Apple Distribution' && call[:use_automatic_signing] == false }
  end

  def test_missing_extension_profile_fails
    error = assert_raises(RuntimeError) { signing_calls(APP_IDENTIFIER => 'main-profile') }
    assert_includes error.message, "#{APP_IDENTIFIER}.LiveActivity"
  end
end

APP_IDENTIFIER = 'com.danfakkeldy.nsmarksthespot'
SCHEME = 'ns-marks-the-spot'
PROJECT_PATH = 'ns-marks-the-spot.xcodeproj'
TEAM_ID = '8AXNA5B37R'
module SharedValues
  MATCH_PROVISIONING_PROFILE_MAPPING = :profiles
end
module UI
  def self.user_error!(message)
    raise message
  end
end
